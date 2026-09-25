import { readFileSync } from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  defaultSettings,
  emptyWorkbench,
  newDocument,
  newSection,
  sectionText,
  targetFor,
} from "../../packages/domain/src/index";

async function fresh(request: APIRequestContext) {
  for (const doc of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + doc.id);
  await request.put("/api/settings", { data: defaultSettings() });
  return (
    await request.post("/api/import", {
      data: { document: newDocument("Rough five-beat draft") },
    })
  ).json();
}

async function saved(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}

test("capture, write, park, edit, export and reinclude a project thought at an exact draft position", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const original = await fresh(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const capture = page.getByLabel("New thought");
  const rough = [
    "The train was quiet.",
    "The window held the city.",
    "A stranger drew a map.",
    "I remembered another route.",
    "The platform looked different.",
  ];
  for (const thought of rough) {
    await capture.fill(thought);
    await capture.press("Enter");
    await expect(capture).toBeFocused();
  }
  const cards = page.getByTestId("structure-item");
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await cards.nth(i).locator(".section-focus").click();
    if (i === 0)
      await cards
        .nth(i)
        .getByTestId("card-writing")
        .getByRole("button")
        .press("Enter");
    await expect(
      cards.nth(i).locator(".card-editor-host .writing-editor"),
    ).toBeVisible();
    await page.keyboard.insertText(`Scene ${i + 1}: `);
    await expect(
      cards.nth(i).getByTestId("writing-section").nth(i),
    ).toContainText(`Scene ${i + 1}: ${rough[i]}`);
  }
  await cards.nth(2).locator(".section-focus").click();
  await cards.nth(2).locator(".section-options summary").click();
  await page.getByLabel("Semantic kind").selectOption("Example");
  await cards.nth(3).locator(".section-focus").click();
  await page
    .getByLabel("Section notes · AI context")
    .fill(
      "Side idea: the other route belongs to this piece, but not this ending.",
    );
  await saved(page);
  const before = await (
    await request.get("/api/documents/" + original.id)
  ).json();
  const sideId = before.sections[3].id;
  expect(before.sections[2].kind).toBe("Example");
  expect(before.sections[4].kind).toBe("Freeform");
  await cards.nth(3).getByRole("button", { name: "Park thought" }).click();
  await expect(page.getByTestId("parked-area")).toContainText(
    "PARKED THOUGHTS · 1",
  );
  await expect(page.locator(`[data-section-id="${sideId}"]`)).toHaveAttribute(
    "data-placement",
    "parked",
  );
  await expect(page.locator(`[data-section-id="${sideId}"]`)).toContainText(
    "excluded from draft",
  );
  await expect(
    page.locator(".writing-editor > section[placement='parked']"),
  ).toBeHidden();
  const draftWords = rough.reduce(
    (total, thought, index) =>
      total +
      (index === 3 ? 0 : `Scene ${index + 1}: ${thought}`.split(/\s+/).length),
    0,
  );
  await expect(page.locator(".writing-footer")).toContainText(
    `${draftWords} words`,
  );

  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  const visibleDraft = await page
    .getByTestId("writing-editor")
    .evaluate((el) => el.innerText);
  expect(visibleDraft).not.toContain("I remembered another route.");
  await page.getByTestId("writing-editor").click();
  await page.getByTestId("writing-editor").press("ControlOrMeta+A");
  await page.getByTestId("writing-editor").press("ControlOrMeta+C");
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("I remembered another route.");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Copy plain text" }).click();
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("I remembered another route.");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Copy document" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Copied document with formatting",
  );
  const clipboard = await page.evaluate(async () => {
    const item = (await navigator.clipboard.read())[0];
    return {
      text: await (await item.getType("text/plain")).text(),
      html: await (await item.getType("text/html")).text(),
    };
  });
  expect(clipboard.text).not.toContain("I remembered another route.");
  expect(clipboard.html).not.toContain("I remembered another route.");
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("I remembered another route.");
  await page.getByRole("button", { name: "Document actions" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Markdown" }).click(),
  ]);
  expect(readFileSync((await download.path())!, "utf8")).not.toContain(
    "I remembered another route.",
  );

  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  const parked = page.locator(`[data-section-id="${sideId}"]`);
  await parked.locator(".section-focus").click();
  const parkedPrompt = parked.getByTestId("card-writing").getByRole("button");
  if (await parkedPrompt.count()) await parkedPrompt.press("Enter");
  await expect(
    parked.locator(".card-editor-host .writing-editor"),
  ).toBeVisible();
  await page.keyboard.insertText("Maybe later: ");
  await expect(
    parked.locator(`.writing-editor > section[id="${sideId}"]`),
  ).toContainText("Maybe later: Scene 4:");
  await saved(page);
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Rough five-beat draft",
  );
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(parked).toHaveAttribute("data-placement", "parked");
  await expect(parked).toContainText("Maybe later: Scene 4:");
  await expect(parked).toContainText("Side idea:");
  await parked.locator(".section-focus").click();
  await parked.getByRole("button", { name: "Include in draft" }).click();
  const position = parked.getByLabel("Draft position");
  await expect(
    parked.getByRole("button", { name: "Include here" }),
  ).toBeDisabled();
  await position.selectOption(before.sections[1].id);
  await parked.getByRole("button", { name: "Include here" }).click();
  await saved(page);
  const after = await (
    await request.get("/api/documents/" + original.id)
  ).json();
  expect(after.sections.map((section: { id: string }) => section.id)).toEqual([
    before.sections[0].id,
    sideId,
    before.sections[1].id,
    before.sections[2].id,
    before.sections[4].id,
  ]);
  expect(after.sections[1].placement).toBe("draft");
  expect(sectionText(after.sections[1])).toContain("Maybe later: Scene 4:");
  expect(after.sections[1].notes).toBe(before.sections[3].notes);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.locator(".writing-footer")).toContainText(
    `${draftWords + 8} words`,
  );
  expect(await editor.evaluate((el) => el.innerText)).toContain(
    "Maybe later: Scene 4:",
  );
});

test("park and include preserve model, variants, history; layout visibility and deliberate Add section persist", async ({
  page,
  request,
}) => {
  for (const doc of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + doc.id);
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("Parked provenance", "Opening line.");
  const side = newSection("Callback", "A possible return.");
  doc.sections.push(side, newSection("Closer", "Ending line."));
  const target = targetFor(doc, side.id);
  side.notes = "Possible callback for later.";
  side.modelOverride = { providerId: "mock", modelId: "plain" };
  side.workbench = {
    ...emptyWorkbench(),
    instruction: "Save this possibility.",
  };
  side.variants = [
    {
      id: "side-variant",
      label: "Alternate return",
      text: "Another return.",
      target,
      createdAt: doc.createdAt,
      origin: "human",
    },
  ];
  doc.history.push({
    id: "side-history",
    createdAt: doc.createdAt,
    target,
    instruction: "Try a return",
    coachQuestion: "What repeats?",
    userAnswer: "The window",
    proposal: "Another return.",
    state: "saved",
    provider: "mock",
  });
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const importedSide = imported.sections[1];
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Hide preview" }).click();
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await page
    .getByTestId("structure-item")
    .nth(1)
    .locator(".section-focus")
    .click();
  await page.getByRole("button", { name: "Park thought" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Show preview" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.locator(`[data-section-id="${importedSide.id}"]`),
  ).toHaveAttribute("data-placement", "draft");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.locator(`[data-section-id="${importedSide.id}"]`),
  ).toHaveAttribute("data-placement", "parked");
  await saved(page);
  await page.getByRole("button", { name: "Hide preview" }).click();
  await page.reload();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Parked provenance",
  );
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(page.getByRole("button", { name: "Overview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show Inspector" }),
  ).toBeVisible();
  await expect(
    page.locator(`[data-section-id="${importedSide.id}"]`),
  ).toHaveAttribute("data-placement", "parked");
  await page
    .getByRole("button", { name: "Add draft section", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Insert section" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Insert Point", exact: true }).click();
  await saved(page);
  const withNew = await (
    await request.get("/api/documents/" + imported.id)
  ).json();
  expect(
    withNew.sections.map((section: { placement: string }) => section.placement),
  ).toEqual(["draft", "draft", "draft", "parked"]);
  const parked = page.locator(`[data-section-id="${importedSide.id}"]`);
  await parked.locator(".section-focus").click();
  await parked.getByRole("button", { name: "Include in draft" }).click();
  await parked.getByLabel("Draft position").selectOption("__end__");
  await parked.getByRole("button", { name: "Include here" }).click();
  await saved(page);
  await page.getByRole("button", { name: "Show preview" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(parked).toHaveAttribute("data-placement", "parked");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(parked).toHaveAttribute("data-placement", "draft");
  await saved(page);
  await page.getByRole("button", { name: "Hide preview" }).click();
  const included = await (
    await request.get("/api/documents/" + imported.id)
  ).json();
  const restored = included.sections.find(
    (section: { id: string }) => section.id === importedSide.id,
  );
  expect(restored.placement).toBe("draft");
  expect(restored.modelOverride).toEqual(importedSide.modelOverride);
  expect(restored.variants).toEqual(importedSide.variants);
  expect(restored.workbench.instruction).toBe(
    importedSide.workbench.instruction,
  );
  expect(
    included.history.find(
      (entry: { id: string }) => entry.id === imported.history[0].id,
    ),
  ).toEqual(imported.history[0]);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Show Inspector" }),
  ).toBeVisible();
});
