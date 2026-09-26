import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  defaultSettings,
  newDocument,
  newSection,
  emptyWorkbench,
  emptyStructure,
  targetFor,
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

test("single-line and multiline quick capture works via button, paste and Enter", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const capture = page.getByLabel("New thought");
  await capture.fill("Typed once.");
  await page.getByRole("button", { name: "Add thought" }).click();
  await capture.fill("Typed first line\nTyped second line");
  await page.getByRole("button", { name: "Add thought" }).click();
  await capture.focus();
  await page.evaluate(() =>
    navigator.clipboard.writeText("Pasted first line\nPasted second line"),
  );
  await capture.press("ControlOrMeta+V");
  await expect(capture).toHaveValue("Pasted first line\nPasted second line");
  await page.getByRole("button", { name: "Add thought" }).click();
  await capture.fill("Entered first line");
  await capture.press("Shift+Enter");
  await capture.pressSequentially("Entered second line");
  await expect(capture).toHaveValue("Entered first line\nEntered second line");
  await capture.press("Enter");
  await expect(capture).toHaveValue("");
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.sections.map(sectionText)).toEqual([
    "Typed once.",
    "Typed first line\nTyped second line",
    "Pasted first line\nPasted second line",
    "Entered first line\nEntered second line",
  ]);
});

test("list shortcuts and toolbar preserve list semantics in draft and parked cards", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  const capture = page.getByLabel("New thought");
  for (const line of ["Opening", "Steps", "Closing"]) {
    await capture.fill(line);
    await capture.press("Enter");
  }
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  const [openingId, stepsId] = stored.sections.map((s: { id: string }) => s.id);
  const opening = page.locator(`[data-section-id="${openingId}"]`);
  await opening.locator(".section-focus").click();
  const prompt = opening.getByTestId("card-writing").getByRole("button");
  if (await prompt.count()) await prompt.press("Enter");
  const editor = opening.locator(".writing-editor");
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await page.keyboard.type("- First bullet");
  await editor.press("Enter");
  await page.keyboard.insertText("Second bullet");
  await expect(page.locator(`[id="${openingId}"] ul li`)).toHaveCount(2);
  const steps = page.locator(`[data-section-id="${stepsId}"]`);
  await steps.locator(".section-focus").click();
  const stepsPrompt = steps.getByTestId("card-writing").getByRole("button");
  if (await stepsPrompt.count()) await stepsPrompt.press("Enter");
  await steps.locator(".writing-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("1. First step");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Second step");
  await expect(page.locator(`[id="${stepsId}"] ol li`)).toHaveCount(2);
  await page.locator(".format-list-menu summary").click();
  await page.getByRole("button", { name: "Bullet list" }).click();
  await expect(page.locator(`[id="${stepsId}"] ul li`)).toHaveCount(2);
  await page.locator(".format-list-menu summary").click();
  await page.getByRole("button", { name: "Numbered list" }).click();
  await expect(page.locator(`[id="${stepsId}"] ol li`)).toHaveCount(2);
  await expect(page.locator(".writing-footer")).toContainText("9 words");
  await steps.getByRole("button", { name: "Park thought" }).click();
  await page.getByRole("button", { name: "+ New parked group" }).click();
  await page.getByLabel("New parked group name").fill("Revision lists");
  await page.getByRole("button", { name: "Create group" }).click();
  await steps.locator(".section-focus").click();
  await steps
    .getByLabel("Group for Freeform")
    .selectOption({ label: "Revision lists" });
  await save(page);
  const parked = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(
    parked.sections.find((s: { id: string }) => s.id === stepsId).content[0]
      .type,
  ).toBe("orderedList");
  await page.reload();
  await expect(page.locator(`[id="${stepsId}"] ol li`)).toHaveCount(2);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(
    page.locator('.writing-editor > section[placement="draft"] ul li'),
  ).toHaveCount(2);
  await expect(
    page.locator('.writing-editor > section[placement="draft"] ol li'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await page.locator(`[data-section-id="${stepsId}"] .section-focus`).click();
  await page.getByRole("button", { name: "Include in draft" }).click();
  await page.getByLabel("Draft position").selectOption("__end__");
  await page.getByRole("button", { name: "Include here" }).click();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(
    page.locator('.writing-editor > section[placement="draft"] ol li'),
  ).toHaveCount(2);
  await save(page);
  const result = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(
    result.sections.find((s: { id: string }) => s.id === stepsId).content[0]
      .type,
  ).toBe("orderedList");
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await steps.locator(".section-focus").click();
  const promptAfter = steps.getByTestId("card-writing").getByRole("button");
  if (await promptAfter.count()) await promptAfter.press("Enter");
  await page.locator(`[id="${stepsId}"] ol li`).last().click();
  await page.getByRole("button", { name: "Split section at cursor" }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(4);
  await expect(page.locator(`[id="${stepsId}"] ol`)).toHaveCount(1);
  await save(page);
  const split = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(
    split.sections.filter((s: { content: { type: string }[] }) =>
      s.content.some((node) => node.type === "orderedList"),
    ),
  ).toHaveLength(2);
});

test("saved Lab work on a card reopens variants and staged Structure without changing prose", async ({
  page,
  request,
}) => {
  await fresh(request);
  const doc = newDocument("Visible work", "The first thought stays.");
  doc.sections.push(newSection("Point", "The second thought stays."));
  const target = targetFor(doc, doc.sections[0].id);
  doc.sections[0].variants = [
    {
      id: "saved-variant",
      label: "Another reading",
      text: "A separate choice.",
      target,
      createdAt: new Date().toISOString(),
      origin: "human",
    },
  ];
  doc.sections[0].workbench = {
    ...emptyWorkbench(),
    structure: {
      ...emptyStructure(),
      thoughtA: "A real first thought",
      thoughtB: "A real second thought",
    },
  };
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  await page.goto("/");
  const first = page.locator(`[data-section-id="${imported.sections[0].id}"]`);
  const second = page.locator(`[data-section-id="${imported.sections[1].id}"]`);
  await expect(second.locator(".card-saved-work")).toHaveCount(0);
  await first.getByRole("button", { name: "1 variant" }).click();
  await expect(page.locator(".inspector details.variants")).toHaveAttribute(
    "open",
    "",
  );
  await expect(page.getByLabel("Variant text")).toHaveValue(
    "A separate choice.",
  );
  await first.getByRole("button", { name: "Structure work" }).click();
  await expect(
    page.locator(".inspector details.structure-tool"),
  ).toHaveAttribute("open", "");
  await expect(page.getByLabel("Thought A · main thought")).toHaveValue(
    "A real first thought",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "The first thought stays.",
  );
  await expect(page.locator(".offline-capability").first()).toContainText(
    "Offline diagnosis",
  );
});

test("real writing pass keeps lists, heading, staged work and preview focus separate from prose", async ({
  page,
  request,
}) => {
  const doc = await fresh(request);
  await page.goto("/");
  const capture = page.getByLabel("New thought");
  for (const text of [
    "The essay begins here.",
    "First step",
    "The essay ends here.",
  ]) {
    await capture.fill(text);
    await capture.press("Enter");
  }
  await save(page);
  const ids = (
    await (await request.get(`/api/documents/${doc.id}`)).json()
  ).sections.map((s: { id: string }) => s.id);
  await capture.focus();
  await page.evaluate(() =>
    navigator.clipboard.writeText("Revise pacing\nCheck transitions"),
  );
  await capture.press("ControlOrMeta+V");
  await page.getByLabel("Thought destination").selectOption("parked");
  await page.getByRole("button", { name: "Add thought" }).click();
  await save(page);
  const parkedDoc = await (
    await request.get(`/api/documents/${doc.id}`)
  ).json();
  const parkedId = parkedDoc.sections[3].id;
  const parkedCard = page.locator(`[data-section-id="${parkedId}"]`);
  await parkedCard.locator(".section-focus").click();
  await parkedCard
    .getByTestId("card-writing")
    .getByRole("button")
    .press("Enter");
  await parkedCard.locator(".writing-editor").press("ControlOrMeta+A");
  await page.locator(".format-list-menu summary").click();
  await page.getByRole("button", { name: "Bullet list" }).click();
  await expect(page.locator(`[id="${parkedId}"] ul li`)).toHaveCount(2);
  const first = page.locator(`[data-section-id="${ids[0]}"]`);
  await first.locator(".section-focus").click();
  const firstPrompt = first.getByTestId("card-writing").getByRole("button");
  if (await firstPrompt.count()) await firstPrompt.press("Enter");
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(page.locator(`[id="${ids[0]}"] h2`)).toHaveText(
    "The essay begins here.",
  );
  const numbered = page.locator(`[data-section-id="${ids[1]}"]`);
  await numbered.locator(".section-focus").click();
  const numberedPrompt = numbered
    .getByTestId("card-writing")
    .getByRole("button");
  if (await numberedPrompt.count()) await numberedPrompt.press("Enter");
  await page.locator(".format-list-menu summary").click();
  await page.getByRole("button", { name: "Numbered list" }).click();
  await expect(page.locator(`[id="${ids[1]}"] ol li`)).toHaveCount(1);
  await numbered.locator(".section-focus").click();
  await expect(page.locator(".offline-capability").first()).toContainText(
    "Offline diagnosis",
  );
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await page
    .getByLabel("Your material", { exact: true })
    .fill("Material: First step, considered again.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("save-variant").first().click();
  await page.locator(".structure-tool > summary").click();
  await page
    .getByLabel("Thought A · main thought")
    .fill("The first step matters");
  await page
    .getByLabel("Thought B · second thought")
    .fill("the ending should connect");
  await page
    .getByRole("button", { name: "Stage for target", exact: true })
    .click();
  await expect(
    numbered.getByRole("button", { name: "1 variant" }),
  ).toBeVisible();
  await expect(
    numbered.getByRole("button", { name: "Structure work" }),
  ).toBeVisible();
  await save(page);
  await page.reload();
  await expect(page.locator(`[id="${parkedId}"] ul li`)).toHaveCount(2);
  await expect(page.locator(`[id="${ids[1]}"] ol li`)).toHaveCount(1);
  await page
    .locator(`[data-section-id="${ids[1]}"]`)
    .getByRole("button", { name: "1 variant" })
    .click();
  await expect(page.locator(".variants")).toHaveAttribute("open", "");
  await page
    .locator(`[data-section-id="${ids[1]}"]`)
    .getByRole("button", { name: "Structure work" })
    .click();
  await expect(page.locator(".structure-tool")).toHaveAttribute("open", "");
  const preview = page.locator('[data-pane="preview"]');
  const before = (await preview.boundingBox())!.width;
  await page.getByRole("button", { name: "Focus preview" }).click();
  expect((await preview.boundingBox())!.width).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Restore panes" }).click();
  expect((await preview.boundingBox())!.width).toBeCloseTo(before, 0);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(
    page.locator('.writing-editor > section[placement="draft"] ul li'),
  ).toHaveCount(0);
  await expect(
    page.locator('.writing-editor > section[placement="draft"] ol li'),
  ).toHaveCount(1);
  await expect(page.locator(`[id="${ids[0]}"] h2`)).toHaveText(
    "The essay begins here.",
  );
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
