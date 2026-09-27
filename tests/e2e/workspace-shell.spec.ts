import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  defaultSettings,
  newDocument,
  newSection,
  emptyWorkbench,
  documentTarget,
  targetFor,
  sectionText,
} from "../../packages/domain/src/index";

async function seed(request: APIRequestContext) {
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("A desk for a long piece", "The opening stays here.");
  for (let i = 2; i <= 11; i++)
    doc.sections.push(
      newSection("Point", `Draft beat ${i} remains in reader order.`),
    );
  const side = newSection(
    "Example",
    "A useful detour belongs to this project.",
  );
  side.placement = "parked";
  side.notes = "Keep this example nearby while shaping the ending.";
  doc.sections.push(side);
  return (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
}

async function save(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}

async function chooseLayout(page: Page, name: string) {
  await page.locator(".layout-menu summary").click();
  await page
    .getByRole("group", { name: "Layout presets" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("desktop shell fits viewport while panes scroll independently and narrow panes stack", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const bodyHeight = () =>
    page.evaluate(() => document.documentElement.scrollHeight);
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  expect(
    await workbench.locator(".structure").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(
    await preview.locator(".writing").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Focus preview" }).click();
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Restore panes" }).click();
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  expect(await bodyHeight()).toBeLessThanOrEqual(901);
  await page.getByRole("button", { name: "Show Inspector" }).click();
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  expect((await preview.boundingBox())!.y).toBeGreaterThan(
    (await workbench.boundingBox())!.y,
  );
});

test("dock resizing, pane visibility, presets and reload preserve one document", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  const inspector = page.locator('[data-pane="inspector"]');
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  const startWidth = (await workbench.boundingBox())!.width;
  const divider = page.getByRole("separator", {
    name: "Resize Workbench and Preview",
  });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 100, { steps: 8 });
  await page.mouse.up();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    startWidth + 70,
  );
  const rightDivider = page.getByRole("separator", {
    name: "Resize Preview and Inspector",
  });
  const rightBox = (await rightDivider.boundingBox())!;
  const previewBefore = (await preview.boundingBox())!.width;
  await page.mouse.move(rightBox.x + rightBox.width / 2, rightBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(
    rightBox.x + rightBox.width / 2 - 35,
    rightBox.y + 100,
    { steps: 5 },
  );
  await page.mouse.up();
  expect((await preview.boundingBox())!.width).toBeLessThan(previewBefore);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await expect(inspector).toBeHidden();
  const savedWidths = (await (await request.get("/api/settings")).json()).layout
    .paneWidths;
  await page.reload();
  await expect(inspector).toBeHidden();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    startWidth + 70,
  );
  expect(
    (await (await request.get("/api/settings")).json()).layout.paneWidths,
  ).toEqual(savedWidths);
  await chooseLayout(page, "Review");
  await expect(inspector).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await preview.boundingBox())!.width).toBeGreaterThan(
    (await workbench.boundingBox())!.width,
  );
  await chooseLayout(page, "Writing");
  await expect(inspector).toBeHidden();
  expect((await workbench.boundingBox())!.width).toBeGreaterThan(
    (await preview.boundingBox())!.width * 1.5,
  );
  await chooseLayout(page, "Workbench only");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeHidden();
  await expect(inspector).toBeHidden();
  await chooseLayout(page, "All panes");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await page
    .getByLabel("New thought")
    .fill("An unfinished capture stays here.");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Keep this sentence spare.");
  const keyboardDivider = page.getByRole("separator", {
    name: "Resize Workbench and Preview",
  });
  const beforeKey = Number(await keyboardDivider.getAttribute("aria-valuenow"));
  await keyboardDivider.focus();
  await keyboardDivider.press("ArrowRight");
  expect(
    Number(await keyboardDivider.getAttribute("aria-valuenow")),
  ).toBeGreaterThan(beforeKey);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await expect(inspector).toBeHidden();
  await page.getByRole("button", { name: "Show Inspector" }).click();
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Keep this sentence spare.",
  );
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(workbench).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(preview).toBeHidden();
  await page.getByRole("button", { name: "Show preview" }).click();
  await page.getByRole("button", { name: "Hide Workbench" }).click();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(workbench).toBeHidden();
  await page.getByRole("button", { name: "Hide preview" }).click();
  await expect(preview).toBeHidden();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Show Workbench" }).click();
  await page.getByRole("button", { name: "Show preview" }).click();
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(page.getByLabel("New thought")).toHaveValue(
    "An unfinished capture stays here.",
  );
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await page.getByRole("button", { name: "Hide Inspector" }).click();
  await page.getByRole("button", { name: "Hide Workbench" }).click();
  await expect(preview).toBeVisible();
  await expect(workbench).toBeHidden();
  await expect(inspector).toBeHidden();
  await chooseLayout(page, "Reset layout");
  await expect(workbench).toBeVisible();
  await expect(preview).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const afterLayout = await (
    await request.get(`/api/documents/${doc.id}`)
  ).json();
  expect(afterLayout.sections[0].workbench.instruction).toBe(
    "Keep this sentence spare.",
  );
  expect(
    afterLayout.sections.map(
      ({ workbench, ...section }: { workbench?: unknown }) => section,
    ),
  ).toEqual(
    doc.sections.map(
      ({ workbench, ...section }: { workbench?: unknown }) => section,
    ),
  );
});

test("Preview focus temporarily expands and restores the exact saved pane arrangement", async ({
  page,
  request,
}) => {
  await seed(request);
  const settings = await (await request.get("/api/settings")).json();
  settings.layout = {
    paneWidths: { workbench: 55, preview: 30, inspector: 15 },
  };
  await request.put("/api/settings", { data: settings });
  await page.goto("/");
  const workbench = page.locator('[data-pane="workbench"]');
  const preview = page.locator('[data-pane="preview"]');
  const inspector = page.locator('[data-pane="inspector"]');
  await expect(workbench).toBeVisible();
  const before = (await preview.boundingBox())!.width;
  await page.getByRole("button", { name: "Focus preview" }).click();
  await expect(workbench).toBeHidden();
  await expect(inspector).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Hide Workbench" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hide Inspector" }),
  ).toHaveCount(0);
  expect((await preview.boundingBox())!.width).toBeGreaterThan(before * 2);
  await page.getByRole("button", { name: "Restore panes" }).click();
  await expect(workbench).toBeVisible();
  await expect(inspector).toBeVisible();
  expect((await preview.boundingBox())!.width).toBeCloseTo(before, 0);
  expect(
    (await (await request.get("/api/settings")).json()).layout.paneWidths,
  ).toEqual(settings.layout.paneWidths);
});

test("parked navigation, editing, reinclusion and narrow writing keep the single editor", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const pageScroll = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Parked · 1" }).click();
  const parkedHeading = page.getByTestId("parked-area");
  const structure = page.getByRole("navigation", {
    name: "Document structure",
  });
  await expect
    .poll(() =>
      parkedHeading.evaluate((element, root) => {
        const a = element.getBoundingClientRect();
        const b = document.querySelector(root)!.getBoundingClientRect();
        return a.top >= b.top + 50 && a.top < b.bottom;
      }, ".structure"),
    )
    .toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  await page.getByRole("button", { name: "Draft · 11" }).click();
  await expect(structure.locator(".section-group-label")).toBeInViewport();
  await page.getByRole("button", { name: "Parked · 1" }).click();
  const parked = page.locator('.structure-item[data-placement="parked"]');
  await parked.locator(".section-focus").click();
  await parked.getByTestId("card-writing").getByRole("button").press("Enter");
  await page.keyboard.insertText("Maybe later: ");
  await expect(parked).toContainText("Maybe later: A useful detour");
  await parked.getByRole("button", { name: "Include in draft" }).click();
  await parked.getByLabel("Draft position").selectOption(doc.sections[10].id);
  await parked.getByRole("button", { name: "Include here" }).click();
  await expect(page.getByRole("button", { name: "Parked · 0" })).toBeDisabled();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Maybe later: A useful detour",
  );
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await page.setViewportSize({ width: 850, height: 850 });
  const boxWorkbench = (await page
    .locator('[data-pane="workbench"]')
    .boundingBox())!;
  const boxPreview = (await page
    .locator('[data-pane="preview"]')
    .boundingBox())!;
  const boxInspector = (await page
    .locator('[data-pane="inspector"]')
    .boundingBox())!;
  expect(boxPreview.y).toBeGreaterThanOrEqual(
    boxWorkbench.y + boxWorkbench.height - 2,
  );
  expect(boxInspector.y).toBeGreaterThanOrEqual(
    boxPreview.y + boxPreview.height - 2,
  );
  await page.getByRole("button", { name: "Hide preview" }).click();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await expect(page.locator('[data-pane="preview"]')).toBeVisible();
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Document structure" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await structure.evaluate((element) => getComputedStyle(element).position),
  ).not.toBe("fixed");
  await page
    .getByLabel("New thought")
    .fill("A fresh line from a native input.");
  await page.getByLabel("New thought").press("Enter");
  await expect(page.getByRole("button", { name: "Draft · 13" })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Show preview" }),
  ).toBeVisible();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "A desk for a long piece",
  );
});

test("seven-section revision loop keeps reading, parked and Lab context without extra requests", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument(
    "Revision continuity",
    "An opening on the doorstep. We listened for a while.",
  );
  for (let i = 1; i < 7; i++)
    doc.sections.push(
      newSection(
        "Freeform",
        i === 1
          ? "We decide later. The kettle ticks while we wait."
          : `Draft thought ${i + 1} changes the angle. A second line holds the thread.`,
      ),
    );
  doc.sections[6].label = "Last door";
  doc.sections[6].content = newSection(
    "Freeform",
    "A repeated sentence. Keep this ending.",
  ).content;
  for (const text of [
    "An aside for later with more room to think.",
    "Another question stays outside the draft.",
  ]) {
    const parked = newSection("Freeform", text);
    parked.placement = "parked";
    doc.sections.push(parked);
  }
  const phrase = "decide later";
  const offset = sectionText(doc.sections[1]).indexOf(phrase);
  const localTarget = targetFor(
    doc,
    doc.sections[1].id,
    "selection",
    offset,
    offset + phrase.length,
  );
  const localId = "local-question";
  doc.sections[1].workbench = {
    ...emptyWorkbench(),
    activeRunId: localId,
    runs: [
      {
        id: localId,
        createdAt: doc.createdAt,
        target: localTarget,
        action: "coach",
        instruction: "Why the delay?",
        answer: "",
        controls: {},
        model: { providerId: "mock", modelId: "conservative" },
        response: {
          provider: "mock",
          diagnosis: "The phrase delays the choice.",
          mechanism: "It lets the pause do work.",
          question: "What are they waiting for?",
          missingIngredients: [],
          proposals: [],
          findings: [],
          lexical: [],
        },
      },
    ],
  };
  const critiqueId = "whole-critique";
  doc.workbench = {
    ...emptyWorkbench(),
    activeRunId: critiqueId,
    runs: [
      {
        id: critiqueId,
        createdAt: doc.createdAt,
        target: documentTarget(doc),
        action: "critique",
        instruction: "Where does repetition hurt?",
        answer: "",
        controls: {},
        model: { providerId: "mock", modelId: "conservative" },
        response: {
          provider: "mock",
          diagnosis: "The last door repeats the earlier delay.",
          mechanism: "Read the transitions together.",
          question: "Which recurrence earns its place?",
          missingIngredients: [],
          proposals: [],
          lexical: [],
          findings: [
            {
              sectionId: doc.sections[6].id,
              title: "Section 7 repeats the explanation.",
              detail: "Cut only the repeated line.",
              severity: "consider",
            },
          ],
        },
      },
    ],
  };
  doc.focusTarget = localTarget;
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const ids: string[] = imported.sections.map((s: { id: string }) => s.id);
  let modelCalls = 0;
  await page.route("**/api/ai", (route) => {
    modelCalls++;
    return route.continue();
  });
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Revision continuity",
  );
  await page.getByLabel("New thought").fill("A new thought belongs here.");
  await page.getByLabel("New thought").press("Enter");
  await expect(page.getByRole("button", { name: "Draft · 8" })).toBeVisible();
  await page.locator(`[data-section-id="${ids[1]}"] .section-focus`).click();
  await expect(page.locator(".response-original")).toContainText(phrase);
  await page.getByRole("button", { name: "Return to selection" }).click();
  await expect(page.locator(`[data-section-id="${ids[1]}"]`)).toHaveClass(
    /active/,
  );
  await expect(page.locator(`[id="${ids[1]}"] .target-highlight`)).toHaveCount(
    1,
  );
  const inspectorScroll = await page
    .locator(".inspector")
    .evaluate((node) => node.scrollTop);
  await page.getByRole("button", { name: "Focus preview" }).click();
  await expect(page.locator(".app")).toHaveClass(/preview-reading/);
  await expect(page.locator(`[id="${ids[1]}"] .target-highlight`)).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator('[data-pane="inspector"]')).toBeHidden();
  await page.getByRole("button", { name: "Restore panes" }).click();
  await expect(page.locator(".app")).not.toHaveClass(/preview-reading/);
  await expect(page.locator('[data-pane="inspector"]')).toBeVisible();
  await expect
    .poll(() => page.locator(".inspector").evaluate((node) => node.scrollTop))
    .toBe(inspectorScroll);
  await expect(page.locator(".response-original")).toContainText(phrase);
  await save(page);
  expect(
    (await (await request.get(`/api/documents/${imported.id}`)).json())
      .revisionTrail,
  ).toEqual([]);
  await page.locator(`[id="${ids[1]}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Another hesitation.");
  await save(page);
  const localEdit = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(localEdit.revisionTrail).toHaveLength(1);
  expect(localEdit.revisionTrail[0]).toMatchObject({
    runId: localEdit.sections[1].workbench.runs[0].id,
    sectionId: ids[1],
    findingIndex: null,
    savedRevision: localEdit.revision,
  });
  await page.locator(`[data-section-id="${ids[5]}"] .section-focus`).click();
  await expect(page.locator(`[id="${ids[5]}"]`)).toBeVisible();
  await expect
    .poll(() =>
      page.locator(`[id="${ids[5]}"]`).evaluate((element) => {
        const pane = element.closest(".writing")!;
        const ratio =
          (element.getBoundingClientRect().top -
            pane.getBoundingClientRect().top) /
          pane.clientHeight;
        return (
          ratio < 0.55 ||
          pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2
        );
      }),
    )
    .toBe(true);
  await page.locator(`[data-section-id="${ids[8]}"] .section-focus`).click();
  await expect(page.getByTestId("lab-return")).toContainText(
    "Return to question",
  );
  await page
    .getByRole("button", { name: "Read parked thought in Preview" })
    .click();
  await expect(page.locator(`[id="${ids[8]}"]`)).toBeVisible();
  await expect(page.locator('[data-pane="preview"]')).toBeVisible();
  await expect(page.locator('[data-pane="workbench"]')).toBeHidden();
  await page.locator(`[id="${ids[8]}"] p`).click();
  await page.keyboard.insertText("Still thinking: ");
  await expect(page.locator(`[id="${ids[8]}"]`)).toContainText(
    "Still thinking:",
  );
  await page.getByRole("button", { name: "Return to draft" }).click();
  await expect(page.locator(`[data-section-id="${ids[5]}"]`)).toHaveClass(
    /active/,
  );
  await expect(page.locator('[data-pane="workbench"]')).toBeVisible();
  await page.getByTestId("lab-return").getByRole("button").click();
  await expect(page.locator(".response-original")).toContainText(phrase);
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await page
    .locator(".finding-references .button")
    .filter({ hasText: "Last door" })
    .click();
  await page.getByTestId("writing-editor").evaluate((root) => {
    const p = root.querySelector(
      `[id="${root.querySelectorAll("section")[6].id}"] p`,
    )!;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode()!;
    let last = first;
    let remaining = "A repeated sentence.".length;
    while (remaining > last.textContent!.length) {
      remaining -= last.textContent!.length;
      last = walker.nextNode()!;
    }
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(first, 0, last, remaining);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("finding-return")).toContainText(
    "Based on an earlier draft",
  );
  await save(page);
  const after = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(after.revisionTrail).toHaveLength(2);
  expect(after.revisionTrail[1]).toMatchObject({
    runId: after.workbench.runs[0].id,
    sectionId: ids[6],
    findingIndex: 0,
    savedRevision: after.revision,
  });
  await page.locator(".revision-trail > summary").click();
  await expect(page.locator(".revision-trail")).toContainText(
    "Viewed before edit",
  );
  await page.getByRole("button", { name: /Return to finding/ }).click();
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  expect(modelCalls).toBe(0);
  await page.reload();
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  const saved = await (
    await request.get(`/api/documents/${imported.id}`)
  ).json();
  expect(
    sectionText(saved.sections.find((s: { id: string }) => s.id === ids[8])),
  ).toContain("Still thinking:");
  expect(modelCalls).toBe(0);
});
