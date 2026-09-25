import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  defaultSettings,
  newDocument,
  sectionText,
} from "../../packages/domain/src/index";

async function fresh(request: APIRequestContext) {
  for (const doc of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + doc.id);
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("The quiet bus ride");
  return (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
}

async function save(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}

async function dragWithMarker(
  page: Page,
  from: number,
  to: number,
  gap: number,
) {
  const cards = page.getByTestId("structure-item");
  const a = (await cards.nth(from).boundingBox())!;
  const b = (await cards.nth(to).boundingBox())!;
  await page.mouse.move(a.x + 12, a.y + 12);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 30, { steps: 4 });
  await page.mouse.move(b.x + 12, b.y + b.height / 2, { steps: 8 });
  await page.mouse.move(b.x + 20, b.y + 12, { steps: 3 });
  await expect(page.getByTestId("drop-marker")).toHaveAttribute(
    "data-drop-index",
    String(gap),
  );
  await page.mouse.up();
}

test("Workbench capture, direct card prose, roles, notes, reorder and Document View share one canonical sequence", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const doc = await fresh(request);
  const firstId = doc.sections[0].id;
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(
    page.getByRole("button", { name: "Workbench", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const thoughts = [
    "I boarded without headphones because the battery was dead.",
    "The bus sounded like a room full of separate weather.",
    "A child counted every stop before the driver announced it.",
    "Maybe silence is not empty; maybe it lets other lives in.",
    "I got off and could still hear the bus a block away.",
  ];
  const capture = page.getByLabel("New thought");
  for (let i = 0; i < thoughts.length; i++) {
    await capture.fill(thoughts[i]);
    await capture.press("Enter");
    await expect(capture).toBeFocused();
    await expect(capture).toHaveValue("");
    await expect(page.getByTestId("structure-item")).toHaveCount(i + 1);
  }
  let stored = await (await request.get("/api/documents/" + doc.id)).json();
  await save(page);
  stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sections[0].id).toBe(firstId);
  expect(stored.sections.map(sectionText)).toEqual(thoughts);

  const cards = page.getByTestId("structure-item");
  for (let i = 0; i < 5; i++) {
    await cards.nth(i).locator(".section-focus").click();
    if (i === 0) {
      await cards
        .nth(i)
        .getByTestId("card-writing")
        .getByRole("button")
        .click();
      await page.keyboard.press("ControlOrMeta+Home");
    }
    await expect(
      cards.nth(i).locator(".card-editor-host .writing-editor"),
    ).toBeVisible();
    await page.keyboard.insertText(`Beat ${i + 1}: `);
    await expect(
      cards.nth(i).getByTestId("writing-section").nth(i),
    ).toContainText(`Beat ${i + 1}: ${thoughts[i]}`);
  }
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await expect(page.getByLabel("Assembled preview")).toContainText("Beat 5:");

  await cards.nth(1).locator(".section-focus").click();
  await page.locator(".section-options > summary").click();
  await page.getByLabel("Semantic kind").selectOption("Point");
  await page
    .getByLabel("Section notes · AI context")
    .fill("Let the crowd become audible.");
  await cards.nth(2).locator(".section-focus").click();
  await page.locator(".section-options > summary").click();
  await page.getByLabel("Semantic kind").selectOption("Example");
  await cards.nth(2).getByRole("button", { name: "+ Add after" }).click();
  await page
    .getByRole("dialog", { name: "Insert section" })
    .getByLabel("All section types")
    .selectOption("Segue");
  await page.getByRole("button", { name: "Insert selected type" }).click();
  await expect(cards).toHaveCount(6);
  await expect(
    cards.nth(3).locator(".card-editor-host .writing-editor"),
  ).toBeVisible();
  await page.keyboard.insertText(
    "But then the child's voice turned the noise into a map.",
  );
  await expect(page.getByTestId("relational-context")).toContainText("Beat 3:");
  await expect(page.getByTestId("relational-context")).toContainText("Beat 4:");
  await save(page);

  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.locator(".structure").evaluate((node) => {
    node.scrollTop = 0;
  });
  await expect(cards.nth(1)).toContainText("Let the crowd become audible.");
  const before = await cards.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-section-id")),
  );
  await dragWithMarker(page, 5, 0, 0);
  await expect(cards.first()).toHaveAttribute("data-section-id", before[5]!);
  await dragWithMarker(page, 0, 4, 5);
  await expect(cards.nth(4)).toHaveAttribute("data-section-id", before[5]!);
  await save(page);
  stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sections.map((section: { id: string }) => section.id)).toEqual([
    before[0],
    before[1],
    before[2],
    before[3],
    before[5],
    before[4],
  ]);
  expect(
    stored.sections.filter(
      (section: { kind: string }) => section.kind === "Freeform",
    ),
  ).toHaveLength(3);

  await page.reload();
  await expect(cards).toHaveCount(6);
  await expect(cards.nth(1)).toContainText("Let the crowd become audible.");
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText("Beat 1:");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "But then the child's voice",
  );
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await page.getByRole("button", { name: "Comfortable", exact: true }).click();
  await cards.nth(1).locator(".section-focus").click();
  await cards.nth(1).getByTestId("card-writing").getByRole("button").click();
  await expect(
    cards.nth(1).locator(".card-editor-host .writing-editor"),
  ).toBeFocused();
  await page.keyboard.insertText("Listen: ");
  await save(page);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText("Listen:");
  stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(sectionText(stored.sections[1])).toContain("Listen:");
  expect(stored.sections.map((section: { id: string }) => section.id)).toEqual([
    before[0],
    before[1],
    before[2],
    before[3],
    before[5],
    before[4],
  ]);
});

test("card writing uses native paste and editor history; capture ignores composing Enter", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const capture = page.getByLabel("New thought");
  await capture.fill("An unfinished line");
  await capture.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
  });
  await expect(capture).toHaveValue("An unfinished line");
  await expect(page.getByTestId("structure-item")).toHaveCount(1);
  await capture.press("Enter");
  await expect(capture).toHaveValue("");
  const card = page.getByTestId("structure-item").first();
  await card.locator(".section-focus").click();
  await card.getByTestId("card-writing").getByRole("button").click();
  const editor = card.locator(".card-editor-host .writing-editor");
  await expect(editor).toBeFocused();
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.insertText("My opening: ");
  await expect(card.getByTestId("writing-section")).toContainText(
    "My opening: An unfinished line",
  );
  await page.evaluate(() =>
    navigator.clipboard.writeText("A pasted sentence. "),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(card.getByTestId("writing-section")).toContainText(
    "A pasted sentence.",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await expect(card.getByTestId("writing-section")).not.toContainText(
    "A pasted sentence.",
  );
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(card.getByTestId("writing-section")).toContainText(
    "A pasted sentence.",
  );
  await editor.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = (node.textContent ?? "").indexOf("unfinished");
      if (start < 0) continue;
      window.getSelection()?.setBaseAndExtent(node, start, node, start + 10);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error("Card prose was not found");
  });
  await page.keyboard.insertText("open");
  await expect(card.getByTestId("writing-section")).toContainText(
    "An open line",
  );
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sections).toHaveLength(1);
  expect(stored.sections[0].id).toBe(doc.sections[0].id);
  expect(sectionText(stored.sections[0])).toContain("A pasted sentence.");
  expect(sectionText(stored.sections[0])).toContain("An open line");
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "A pasted sentence.",
  );
});

test("first click in existing card prose places the caret near that sentence", async ({
  page,
  request,
}) => {
  await fresh(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const capture = page.getByLabel("New thought");
  await capture.fill("First sentence. Second sentence near the end.");
  await capture.press("Enter");
  const prompt = page.locator(".card-write-prompt");
  const point = await prompt.evaluate((element) => {
    const text = element.firstChild!;
    const offset = text.textContent!.indexOf("Second") + 2;
    const range = document.createRange();
    range.setStart(text, offset);
    range.setEnd(text, offset + 1);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  const editor = page.locator(".card-editor-host .writing-editor");
  await expect(editor).toBeFocused();
  await page.keyboard.insertText("actually ");
  const prose = await page.getByTestId("writing-section").first().innerText();
  expect(prose).toContain("First sentence.");
  expect(prose.indexOf("actually ")).toBeGreaterThan("First sentence.".length);
});
