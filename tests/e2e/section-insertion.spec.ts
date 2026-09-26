import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  newDocument,
  newSection,
  defaultSettings,
  sectionKinds,
  documentText,
  emptyWorkbench,
  targetFor,
  uid,
} from "../../packages/domain/src/index";
async function seed(
  request: APIRequestContext,
  kinds: string[] = ["Point", "Point"],
) {
  for (const d of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("Free composition");
  doc.sections = kinds.map((kind, i) =>
    newSection(kind as any, `Passage ${i + 1} stays where I put it.`),
  );
  return (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
}
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}
async function save(page: Page) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
}
async function data(request: APIRequestContext, id: string) {
  return (await request.get("/api/documents/" + id)).json();
}
async function options(page: Page, index: number) {
  await page
    .getByTestId("structure-item")
    .nth(index)
    .locator(".section-focus")
    .click();
  const details = page.locator(".section-options");
  if (!(await details.evaluate((e) => e.hasAttribute("open"))))
    await details.locator("summary").click();
}
async function gap(page: Page, beforeId: string | null) {
  const target = page.locator(
    `[data-testid="insert-at-gap"][data-before-section-id="${beforeId ?? ""}"]`,
  );
  await target.focus();
  await expect(target).toHaveCSS("opacity", "1");
  await target.click();
  await expect(
    page.getByRole("dialog", { name: "Insert section", exact: true }),
  ).toBeVisible();
}
async function choose(page: Page, kind: string) {
  const dialog = page.getByRole("dialog", {
    name: "Insert section",
    exact: true,
  });
  await dialog.getByLabel("All section types").selectOption(kind);
  await dialog
    .getByRole("button", { name: "Insert selected type", exact: true })
    .click();
}

test("inline labels survive a Preview edit in another section", async ({
  page,
  request,
}) => {
  const doc = await seed(request, ["Point", "Freeform", "Closer"]);
  await open(page);
  const renamed = page.locator(`[data-section-id="${doc.sections[1].id}"]`);
  await renamed.getByRole("button", { name: "Name section 2" }).click();
  await page.getByLabel("Short label for section 2").fill("What waiting did");
  await page.getByLabel("Short label for section 2").press("Enter");
  await expect(renamed.locator(".section-focus")).toContainText(
    "What waiting did",
  );
  await page
    .locator(`[data-section-id="${doc.sections[2].id}"] .section-focus`)
    .click();
  await page.locator(`[id="${doc.sections[2].id}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" A new thought.");
  await save(page);
  expect((await data(request, doc.id)).sections[1].label).toBe(
    "What waiting did",
  );
  await page.reload();
  await expect(
    page.locator(`[data-section-id="${doc.sections[1].id}"] .section-focus`),
  ).toContainText("What waiting did");
});

test("several inline labels and unrelated metadata remain attached after prose edits and Lab activity", async ({
  page,
  request,
}) => {
  let doc = await seed(request, ["Point", "Freeform", "Closer", "Point"]);
  doc.sections[1].notes = "Private beat note.";
  doc.sections[1].modelOverride = {
    providerId: "mock",
    modelId: "conservative",
  };
  doc = await (
    await request.put(`/api/documents/${doc.id}`, { data: doc })
  ).json();
  await open(page);
  const labels = ["List starts lying", "Waiting changes things", "The turn"];
  for (let i = 1; i < 4; i++) {
    const item = page.locator(`[data-section-id="${doc.sections[i].id}"]`);
    await item.getByRole("button", { name: `Name section ${i + 1}` }).click();
    await page
      .getByLabel(`Short label for section ${i + 1}`)
      .fill(labels[i - 1]);
    await page.getByLabel(`Short label for section ${i + 1}`).press("Enter");
    await expect(item.locator(".section-focus")).toContainText(labels[i - 1]);
  }
  await page
    .locator(`[data-section-id="${doc.sections[0].id}"] .section-focus`)
    .click();
  await page.locator(`[id="${doc.sections[0].id}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" An additional sentence.");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toBeVisible();
  await save(page);
  const stored = await data(request, doc.id);
  expect(
    stored.sections.slice(1).map((s: { label: string }) => s.label),
  ).toEqual(labels);
  expect(stored.sections[1]).toMatchObject({
    id: doc.sections[1].id,
    kind: "Freeform",
    notes: "Private beat note.",
    modelOverride: { providerId: "mock", modelId: "conservative" },
    placement: "draft",
  });
});

test("Section options label uses the same section-local metadata path", async ({
  page,
  request,
}) => {
  const doc = await seed(request, ["Point", "Freeform", "Closer"]);
  await open(page);
  await options(page, 1);
  await page
    .locator(`[data-section-id="${doc.sections[1].id}"] .section-options`)
    .getByLabel("Label")
    .fill("An options label");
  await page
    .locator(`[data-section-id="${doc.sections[1].id}"] .section-options`)
    .getByLabel("Semantic kind")
    .selectOption("Segue");
  await page
    .locator(`[data-section-id="${doc.sections[2].id}"] .section-focus`)
    .click();
  await page.locator(`[id="${doc.sections[2].id}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Still here.");
  await save(page);
  expect((await data(request, doc.id)).sections[1]).toMatchObject({
    label: "An options label",
    kind: "Segue",
  });
});

test("inline label stays with its section through reorder, split, park and include", async ({
  page,
  request,
}) => {
  const doc = await seed(request, ["Point", "Freeform", "Closer"]);
  await open(page);
  const id = doc.sections[1].id;
  const item = page.locator(`[data-section-id="${id}"]`);
  await item.getByRole("button", { name: "Name section 2" }).click();
  await page.getByLabel("Short label for section 2").fill("A movable thought");
  await page.getByLabel("Short label for section 2").press("Enter");
  await item.locator(".section-focus").click();
  await item.locator(".section-options summary").click();
  await item.getByRole("button", { name: "Move section up" }).click();
  await expect(page.getByTestId("structure-item").first()).toHaveAttribute(
    "data-section-id",
    id,
  );
  await item.locator(".section-focus").click();
  await page.locator(`[id="${id}"] p`).evaluate((p) => {
    const text = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode()!;
    window.getSelection()?.setBaseAndExtent(text, 10, text, 10);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await page.getByRole("button", { name: "Split section at cursor" }).click();
  await expect(item.locator(".section-focus")).toContainText(
    "A movable thought",
  );
  await item.locator(".section-focus").click();
  await item.getByRole("button", { name: "Park thought" }).click();
  await save(page);
  let stored = await data(request, doc.id);
  expect(
    stored.sections.find((s: { id: string }) => s.id === id),
  ).toMatchObject({ label: "A movable thought", placement: "parked" });
  await item.locator(".section-focus").click();
  await item.getByRole("button", { name: "Include in draft" }).click();
  await item
    .getByLabel("Draft position")
    .selectOption({ label: "At end of draft" });
  await item.getByRole("button", { name: "Include here" }).click();
  await save(page);
  stored = await data(request, doc.id);
  expect(
    stored.sections.find((s: { id: string }) => s.id === id),
  ).toMatchObject({ label: "A movable thought", placement: "draft" });
  await page.reload();
  await expect(item.locator(".section-focus")).toContainText(
    "A movable thought",
  );
});

test("hover/focus boundaries insert at start, middle and end; all types stay available", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await expect(page.getByTestId("insert-at-gap")).toHaveCount(3);
  await expect(
    page.getByTestId("writing-editor").locator("button"),
  ).toHaveCount(0);
  const middle = page.locator(
    `[data-testid="insert-at-gap"][data-before-section-id="${doc.sections[1].id}"]`,
  );
  const box = await middle.boundingBox();
  await page.mouse.move(box!.x + 120, box!.y + 16);
  await expect(middle).toHaveCSS("opacity", "1");
  await middle.click();
  await expect(
    page.getByLabel("All section types").locator("option"),
  ).toHaveCount(sectionKinds.length);
  await choose(page, "Segue");
  await page.keyboard.insertText("A bridge, right here.");
  await save(page);
  let stored = await data(request, doc.id);
  expect(stored.sections.map((s: any) => s.kind)).toEqual([
    "Point",
    "Segue",
    "Point",
  ]);
  expect(stored.sections[0].content).toEqual(doc.sections[0].content);
  expect(stored.sections[2].content).toEqual(doc.sections[1].content);
  await gap(page, doc.sections[0].id);
  await choose(page, "Callback");
  await page.keyboard.insertText("Start with a callback.");
  await gap(page, null);
  await choose(page, "Point");
  await page.keyboard.insertText("Another point, not a mandatory closer.");
  await save(page);
  stored = await data(request, doc.id);
  expect(stored.sections.map((s: any) => s.kind)).toEqual([
    "Callback",
    "Point",
    "Segue",
    "Point",
    "Point",
  ]);
  await page.reload();
  await expect(page.getByTestId("structure-item")).toHaveCount(5);
  await expect(page.getByTestId("writing-editor")).toContainText(
    "A bridge, right here.",
  );
});
test("above/below actions, search, conversion, reorder and Undo share the same instances", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await options(page, 1);
  await page.getByRole("button", { name: "Insert above", exact: true }).click();
  await page.getByLabel("Search section types").fill("cliff");
  await expect(
    page.getByLabel("All section types").locator("option"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Insert selected type" }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await page.keyboard.insertText("An intentional cliffhanger.");
  await options(page, 1);
  await page.getByLabel("Semantic kind").selectOption("Callback");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "An intentional cliffhanger.",
  );
  await page.getByRole("button", { name: "Insert below", exact: true }).click();
  await choose(page, "Freeform");
  await expect(page.getByTestId("structure-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByTestId("structure-item").last().scrollIntoViewIfNeeded();
  const firstHeight = (await page
    .getByTestId("structure-item")
    .first()
    .boundingBox())!.height;
  await page
    .getByTestId("structure-item")
    .last()
    .dragTo(page.getByTestId("structure-item").first(), {
      targetPosition: { x: 20, y: firstHeight - 12 },
    });
  await save(page);
  const stored = await data(request, doc.id);
  expect(stored.sections.map((s: any) => s.kind)).toEqual([
    "Point",
    "Point",
    "Callback",
    "Freeform",
  ]);
  expect(stored.sections[0].id).toBe(doc.sections[1].id);
});
test("section copies preserve independent workbench, model, notes, variants and pending history", async ({
  page,
  request,
}) => {
  let doc = await seed(request);
  const section = doc.sections[0];
  section.notes = "My instance note.";
  section.modelOverride = { providerId: "mock", modelId: "plain" };
  const target = targetFor(doc, section.id);
  const runId = uid(),
    proposalId = uid();
  section.workbench = {
    ...emptyWorkbench(),
    instruction: "Keep my rough language.",
    answer: "My real observation.",
    activeRunId: runId,
    runs: [
      {
        id: runId,
        createdAt: doc.createdAt,
        target,
        action: "coach",
        instruction: "Keep my rough language.",
        answer: "My real observation.",
        controls: {},
        model: section.modelOverride,
        response: {
          provider: "mock",
          model: section.modelOverride,
          routeSource: "section",
          diagnosis: "A test proposal, not applied.",
          mechanism: "Keep the observation.",
          question: "What must stay?",
          missingIngredients: [],
          proposals: [
            {
              id: proposalId,
              label: "Alternative",
              text: "A different point.",
              explanation: "Test fixture.",
            },
          ],
          findings: [],
          lexical: [],
        },
      },
    ],
  };
  section.variants = [
    {
      id: uid(),
      label: "Original",
      text: target.text,
      target,
      createdAt: doc.createdAt,
      origin: "original",
      runId,
      model: section.modelOverride,
    },
  ];
  doc.history = [
    {
      id: proposalId,
      createdAt: doc.createdAt,
      target,
      instruction: "Keep my rough language.",
      coachQuestion: "What must stay?",
      userAnswer: "My real observation.",
      proposal: "A different point.",
      state: "proposed",
      provider: "mock",
      model: section.modelOverride,
      runId,
    },
  ];
  doc = await (
    await request.put("/api/documents/" + doc.id, { data: doc })
  ).json();
  await open(page);
  await options(page, 0);
  await page
    .getByRole("button", { name: "Duplicate section", exact: true })
    .click();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Keep my rough language.",
  );
  await expect(page.getByLabel("Edit proposal 1")).toHaveValue(
    "A different point.",
  );
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("This copy is independent.");
  await page.getByTestId("accept-proposal").click();
  await save(page);
  let stored = await data(request, doc.id);
  expect(stored.sections[0].content).toEqual(doc.sections[0].content);
  expect(stored.sections[0].workbench.instruction).toBe(
    "Keep my rough language.",
  );
  expect(stored.sections[1].workbench.instruction).toBe(
    "This copy is independent.",
  );
  expect(stored.sections[1].modelOverride).toEqual(section.modelOverride);
  expect(stored.sections[1].notes).toBe(section.notes);
  expect(stored.sections[1].variants).toHaveLength(2);
  expect(stored.history[0].state).toBe("proposed");
  expect(stored.history[1].state).toBe("accepted");
  expect(stored.sections[1].workbench.runs[0].target.sectionId).toBe(
    stored.sections[1].id,
  );
  await page.reload();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await expect(page.getByTestId("writing-editor")).toContainText(
    "A different point.",
  );
});
test("deleting any section including the last is confirmed and undoable", async ({
  page,
  request,
}) => {
  const doc = await seed(request, ["Closer"]);
  await open(page);
  await options(page, 0);
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep writing" }).click();
  await expect(page.getByTestId("writing-editor")).toContainText("Passage 1");
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete section", exact: true })
    .click();
  await expect(page.getByTestId("writing-editor")).toHaveText("");
  await save(page);
  expect((await data(request, doc.id)).sections[0].kind).toBe("Freeform");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText("Passage 1");
  await save(page);
  expect((await data(request, doc.id)).sections[0].kind).toBe("Closer");
});
test("arbitrary counts and order survive insertion, editing and clipboard without control text", async ({
  page,
  request,
}) => {
  const kinds = [
    "Point",
    "Point",
    "Segue",
    "Callback",
    "Point",
    "Segue",
    "Point",
    "Callback",
    "Point",
    "Segue",
    "Freeform",
  ];
  const doc = await seed(request, kinds);
  await open(page);
  await expect(page.getByTestId("structure-item")).toHaveCount(11);
  await expect(page.getByTestId("insert-at-gap")).toHaveCount(12);
  await gap(page, doc.sections[4].id);
  await choose(page, "Point");
  await page.keyboard.insertText("An unrestricted sixth Point.");
  await save(page);
  const stored = await data(request, doc.id);
  expect(stored.sections.filter((s: any) => s.kind === "Point")).toHaveLength(
    6,
  );
  expect(
    stored.sections.some((s: any) => s.kind === "Hook" || s.kind === "Closer"),
  ).toBe(false);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("button", { name: "Copy plain text", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    documentText(stored),
  );
  await page.getByTestId("writing-editor").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("An unrestricted sixth Point.");
  expect(copied).not.toContain("Insert section");
  expect(copied).not.toContain("+");
  await page.reload();
  await expect(page.getByTestId("structure-item")).toHaveCount(12);
});
test("new instances immediately inherit model/style rules and maintain global-read local-edit scope", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const settings = await (await request.get("/api/settings")).json();
  settings.routing = {
    applicationDefault: null,
    sectionTypeDefaults: { Segue: { providerId: "mock", modelId: "plain" } },
    taskDefaults: {},
  };
  await request.put("/api/settings", { data: settings });
  const lib = await (await request.get("/api/library")).json();
  await request.put("/api/library", {
    data: {
      ...lib,
      items: [
        {
          id: uid(),
          kind: "style_rule",
          title: "Segue rule",
          content: "Keep transitions brief.",
          ruleKey: "transitions",
          sectionKinds: ["Segue"],
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      ],
    },
  });
  await open(page);
  await gap(page, doc.sections[1].id);
  await choose(page, "Segue");
  await page.keyboard.insertText(
    "I really use a bridge in order to connect these ideas.",
  );
  await page
    .getByTestId("structure-item")
    .nth(1)
    .locator(".section-focus")
    .click();
  await page
    .getByLabel("Writing action", { exact: true })
    .selectOption("shorten");
  const event = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page.getByRole("button", { name: /Diagnose this section/ }).click();
  const body = (await event).postDataJSON();
  expect(body.readContext.document.sections).toHaveLength(3);
  expect(body.editTarget.sectionId).not.toBe(doc.sections[0].id);
  expect(body.readContext.resolvedStyle.effective.transitions.value).toBe(
    "Keep transitions brief.",
  );
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await page.getByLabel("Your material").fill("Trim the filler.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("accept-proposal").click();
  await save(page);
  const stored = await data(request, doc.id);
  expect(stored.sections[0].content).toEqual(doc.sections[0].content);
  expect(stored.sections[2].content).toEqual(doc.sections[1].content);
  expect(stored.sections[1].variants).toHaveLength(1);
});
test("gap picker is keyboard reachable, cancellable, and visually quiet in light/dark views", async ({
  page,
  request,
}) => {
  const doc = await seed(request, ["Hook", "Point", "Segue"]);
  await open(page);
  await gap(page, doc.sections[1].id);
  await page.screenshot({
    path: "artifacts/section-insertion-light.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Insert section", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(`[data-before-section-id="${doc.sections[1].id}"]`),
  ).toBeFocused();
  expect(documentText(await data(request, doc.id))).toBe(documentText(doc));
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await gap(page, doc.sections[2].id);
  await page.screenshot({
    path: "artifacts/section-insertion-dark.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
});
