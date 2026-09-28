import { readFileSync } from "node:fs";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { createLibraryItem } from "../../apps/web/src/library-helpers";
import {
  newDocument,
  newSection,
  defaultSettings,
  emptyLibrary,
  documentText,
  modelKey,
} from "../../packages/domain/src/index";
async function seed(request: APIRequestContext) {
  for (const d of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const lib = await (await request.get("/api/library")).json();
  await request.put("/api/library", {
    data: { ...emptyLibrary(), revision: lib.revision },
  });
  const doc = newDocument(
    "My thought workshop",
    "I really liked the tool. It cost too much.",
  );
  doc.sections[0].kind = "Hook";
  doc.sections[0].label = "Hook";
  doc.sections.push(newSection("Segue", "The next thought stays intact."));
  doc.sections.push(newSection("Closer", "que sera sera"));
  doc.brief.contentType = "narration";
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
async function focus(page: Page, kind: string) {
  await page
    .getByRole("button", { name: new RegExp("^\\d{2} " + kind + "$") })
    .click();
}
async function stored(request: APIRequestContext, id: string) {
  return (await request.get("/api/documents/" + id)).json();
}
async function library(request: APIRequestContext) {
  return (await request.get("/api/library")).json();
}
async function toggle(page: Page, selector: string) {
  const d = page.locator(selector);
  if (!(await d.evaluate((el) => el.hasAttribute("open"))))
    await d.locator("> summary").click();
}
async function select(page: Page, text: string) {
  await page.getByTestId("writing-editor").evaluate((root, text) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) {
      const index = (n.textContent ?? "").indexOf(text);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(n, index);
      range.setEnd(n, index + text.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      (root as HTMLElement).focus();
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw Error("Text missing");
  }, text);
}
async function builder(page: Page) {
  await toggle(page, ".structure-tool");
}
async function fillThoughts(page: Page) {
  await page
    .getByLabel("Thought A · main thought")
    .fill("The software was useful");
  await page
    .getByLabel("Thought B · second thought")
    .fill("it was too expensive");
}

test("Your writing retrieves saved Hook guidance locally and attaches only an explicit run snapshot", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const libraryBefore = await library(request);
  const rule = {
    ...createLibraryItem({
      kind: "style_rule",
      title: "Opening restraint",
      content: "Keep the reveal unannounced.",
    }),
    sectionKinds: ["Hook"],
  };
  const move = {
    ...createLibraryItem({
      kind: "move",
      title: "Object first",
      content: "Name the object, then stop.",
    }),
    sectionKinds: ["Hook"],
  };
  const other = {
    ...createLibraryItem({
      kind: "move",
      title: "Ending",
      content: "Finish the scene.",
    }),
    sectionKinds: ["Closer"],
  };
  await request.put("/api/library", {
    data: { ...libraryBefore, items: [other, move, rule] },
  });
  const settings = await (await request.get("/api/settings")).json();
  await request.put("/api/settings", {
    data: {
      ...settings,
      styleDNA: { ...settings.styleDNA, rhythm: "Keep the abrupt turn." },
    },
  });
  const requests: any[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) requests.push(event.postDataJSON());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await focus(page, "Hook");
  const contextual = page.getByTestId("your-writing");
  await expect(contextual).toContainText("Keep the reveal unannounced.");
  await expect(contextual).toContainText("Keep the abrupt turn.");
  await expect(contextual).toContainText("Name the object, then stop.");
  await expect(contextual).not.toContainText("Finish the scene.");
  await expect(contextual).toContainText("SECTION STYLE");
  await expect(contextual).toContainText("STYLE DNA");
  await expect(contextual).toContainText("PERSONAL LIBRARY");
  expect(requests).toHaveLength(0);
  const item = contextual
    .locator("[data-guidance-id]")
    .filter({ hasText: rule.content });
  await item.getByRole("button", { name: "Copy", exact: true }).focus();
  await item.getByRole("button", { name: "Copy", exact: true }).press("Enter");
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  await item.getByRole("button", { name: "Use as guidance" }).click();
  await expect(page.getByTestId("run-guidance")).toContainText(rule.content);
  await expect(page.getByTestId("run-guidance")).toContainText("SECTION STYLE");
  await page
    .getByTestId("run-guidance")
    .getByRole("button", { name: "Remove guidance" })
    .click();
  await expect(page.getByTestId("run-guidance")).toHaveCount(0);
  await item.getByRole("button", { name: "Use as guidance" }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.getByTestId("lab-follow-up")).toContainText(rule.content);
  expect(requests[0].explicitGuidance).toMatchObject([
    { itemId: rule.id, text: rule.content },
  ]);
  await save(page);
  const saved = await stored(request, doc.id);
  expect(saved.sections[0].workbench.runs[0].guidance).toMatchObject([
    { source: "section_style", itemId: rule.id, text: rule.content },
  ]);
  expect(documentText(saved)).toBe(documentText(doc));
});

test("contextual guidance reflects source edits without rewriting an earlier Lab snapshot", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const current = await library(request);
  const move = {
    ...createLibraryItem({
      kind: "move",
      title: "Opening move",
      content: "Lead with the cost.",
    }),
    sectionKinds: ["Hook"],
  };
  await request.put("/api/library", { data: { ...current, items: [move] } });
  await page.setViewportSize({ width: 1024, height: 768 });
  await open(page);
  await focus(page, "Hook");
  const contextual = page.getByTestId("your-writing");
  await expect(contextual).toBeVisible();
  await contextual.locator("summary").click();
  await expect(contextual).toContainText(move.content);
  await contextual.getByRole("button", { name: "Not relevant" }).click();
  await expect(contextual).toContainText("1 hidden saved item");
  await expect(
    contextual.getByRole("button", { name: "View source" }),
  ).toHaveCount(0);
  await focus(page, "Segue");
  await focus(page, "Hook");
  await expect(contextual).toContainText("1 hidden saved item");
  await contextual.locator("summary").first().click();
  await contextual.getByText("Show hidden guidance").click();
  await contextual.getByRole("button", { name: "Restore guidance" }).click();
  await expect(
    contextual.getByRole("button", { name: "View source" }),
  ).toBeVisible();
  await contextual.getByRole("button", { name: "View source" }).click();
  await expect(
    page.getByRole("dialog", { name: "Personal Writing Library" }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "Personal Writing Library" })
    .getByRole("button", { name: "Close dialog" })
    .click();
  await contextual.getByRole("button", { name: "Use as guidance" }).click();
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.getByTestId("run-guidance-snapshot")).toContainText(
    move.content,
  );
  await save(page);
  const saved = await stored(request, doc.id);
  expect(saved.sections[0].workbench.runs[0].guidance[0].text).toBe(
    move.content,
  );
  const newer = await library(request);
  await request.put("/api/library", {
    data: {
      ...newer,
      items: newer.items.map((item: any) =>
        item.id === move.id
          ? {
              ...item,
              kind: "pattern",
              content: "Let the object carry the turn.",
            }
          : item,
      ),
    },
  });
  await page.reload();
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toContainText(
    "Let the object carry the turn.",
  );
  await expect(page.getByTestId("your-writing")).toContainText(
    "PERSONAL LIBRARY · PATTERN",
  );
  await expect(page.getByTestId("run-guidance-snapshot")).toContainText(
    move.content,
  );
  await expect(page.getByTestId("run-guidance-snapshot")).toContainText(
    "PERSONAL LIBRARY · MOVE",
  );
  const last = await library(request);
  await request.put("/api/library", {
    data: {
      ...last,
      items: last.items.filter((item: any) => item.id !== move.id),
    },
  });
  await page.reload();
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toHaveCount(0);
  await expect(page.getByTestId("run-guidance-snapshot")).toContainText(
    move.content,
  );
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});

test("document-local hidden guidance survives archive and export but a UI duplicate starts fresh", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const initialLibrary = await library(request);
  const item = {
    ...createLibraryItem({
      kind: "move",
      title: "My Hook move",
      content: "Stop at the precise object.",
    }),
    sectionKinds: ["Hook"],
  };
  await request.put("/api/library", {
    data: { ...initialLibrary, items: [item] },
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await focus(page, "Hook");
  const contextual = page.getByTestId("your-writing");
  await contextual.getByRole("button", { name: "Not relevant" }).click();
  await expect(contextual).toContainText("1 hidden saved item");
  await save(page);
  const saved = await stored(request, doc.id);
  expect(saved.guidanceDismissals).toHaveLength(1);
  await page.getByRole("button", { name: "Document actions" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = JSON.parse(
    readFileSync((await (await download).path())!, "utf8"),
  );
  expect(exported.guidanceDismissals).toEqual(saved.guidanceDismissals);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  const switcher = page.getByLabel("Switch document");
  await expect.poll(() => switcher.inputValue()).not.toBe(doc.id);
  const copy = await stored(request, await switcher.inputValue());
  expect(copy.guidanceDismissals).toEqual([]);
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toContainText(item.content);
  await switcher.selectOption(doc.id);
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toContainText(
    "1 hidden saved item",
  );
  await request.post("/api/documents/archive", { data: { ids: [doc.id] } });
  const archived = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(archived.guidanceDismissals).toEqual(saved.guidanceDismissals);
  await request.post("/api/documents/restore", { data: { ids: [doc.id] } });
  await page.reload();
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toContainText(
    "1 hidden saved item",
  );
  const laterLibrary = await library(request);
  await request.put("/api/library", { data: { ...laterLibrary, items: [] } });
  await page.reload();
  await focus(page, "Hook");
  await expect(page.getByTestId("your-writing")).toHaveCount(0);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});

test("stacked Segue shows only saved connector guidance without mixing Sources or Piece Memory", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Rewrite the ending later.";
  doc.sources.push({
    id: "source-quote",
    title: "Evidence quote",
    kind: "quote",
    text: "An unrelated source quotation.",
    url: "",
  });
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  const lib = await library(request);
  const connector = createLibraryItem({
    kind: "connector",
    title: "My segue",
    content: "Prefer 'but' over formal transitions.",
  });
  const avoid = createLibraryItem({
    kind: "connector",
    title: "Formal connector",
    content: "however",
    preference: "avoid",
  });
  await request.put("/api/library", {
    data: { ...lib, items: [connector, avoid] },
  });
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await page.setViewportSize({ width: 700, height: 900 });
  await open(page);
  await focus(page, "Segue");
  const contextual = page.getByTestId("your-writing");
  await expect(contextual).toBeVisible();
  await contextual.locator("summary").click();
  await expect(contextual).toContainText("CONNECTOR PREFERENCE");
  await expect(contextual).toContainText(connector.content);
  await expect(contextual).toContainText("CONNECTOR PREFERENCE · AVOID");
  await expect(contextual).not.toContainText(doc.pieceMemory.nextMove);
  await expect(contextual).not.toContainText("An unrelated source quotation.");
  expect(calls).toHaveLength(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(701);
});

test("selected snippet quick-save, contextual surfacing, tags and metadata persist without insertion", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await focus(page, "Closer");
  await toggle(page, ".inspector > .quick-save");
  await page
    .getByLabel("Why keep this? (optional)")
    .fill("Playfully resigned ending.");
  await page
    .getByRole("button", { name: "Save exact snippet", exact: true })
    .click();
  await expect.poll(async () => (await library(request)).items.length).toBe(1);
  await toggle(page, ".context-library");
  await expect(page.locator(".context-library")).toContainText("que sera sera");
  await focus(page, "Hook");
  await expect(page.locator(".context-library article")).toHaveCount(0);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  await page
    .getByRole("button", { name: "Personal library", exact: true })
    .first()
    .click();
  await page.getByLabel("Search Personal Library").fill("resigned");
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page
    .getByLabel("Custom tags (comma-separated)")
    .fill("Funny, Ominous, my-special-ending");
  await page.getByLabel("Effects (comma-separated)").fill("resigned, playful");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Personal library", exact: true })
    .first()
    .click();
  await page.getByLabel("Search Personal Library").fill("my-special-ending");
  await expect(page.locator(".library-entry")).toHaveCount(1);
  await expect(page.locator(".library-entry")).toContainText("Funny");
  await page.screenshot({
    path: "artifacts/personal-library.png",
    fullPage: true,
  });
});
test("candidate saved as style example is not accepted or made into an automatic rule", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "I really liked the tool.");
  await page
    .getByLabel("Writing action", { exact: true })
    .selectOption("shorten");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await page.getByLabel("Your material").fill("Remove the filler.");
  await page.getByRole("button", { name: "Propose options" }).click();
  const proposal = page.getByTestId("proposal").first();
  await proposal.locator(".quick-save > summary").click();
  await proposal
    .getByRole("button", { name: "Save as style example", exact: true })
    .click();
  await expect.poll(async () => (await library(request)).items.length).toBe(1);
  await save(page);
  const saved = (await library(request)).items[0];
  expect(saved.kind).toBe("style_example");
  expect(saved.provenance.runId).toBeTruthy();
  expect(saved.content).toBe("I liked the tool.");
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("Hook and Segue rules are isolated, notes and current instruction override named preferences", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Style guides", exact: true }).click();
  await page.getByLabel("Section style guide").selectOption("Hook");
  await page
    .getByLabel("Style preference key", { exact: true })
    .fill("transitions");
  await page
    .getByLabel("Style preference", { exact: true })
    .fill("Concrete before abstract.");
  await page.getByRole("button", { name: "Save style rule" }).click();
  await page.getByLabel("Section style guide").selectOption("Segue");
  await page
    .getByLabel("Style preference key", { exact: true })
    .fill("transitions");
  await page
    .getByLabel("Style preference", { exact: true })
    .fill("Short and unannounced.");
  await page.getByRole("button", { name: "Save style rule" }).click();
  await expect.poll(async () => (await library(request)).items.length).toBe(2);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await focus(page, "Hook");
  await toggle(page, ".style-context");
  await expect(page.locator(".style-context")).toContainText(
    "Concrete before abstract.",
  );
  await expect(page.locator(".style-context")).not.toContainText(
    "Short and unannounced.",
  );
  await focus(page, "Segue");
  await expect(page.locator(".style-context")).toContainText(
    "Short and unannounced.",
  );
  await expect(page.locator(".style-context")).not.toContainText(
    "Concrete before abstract.",
  );
  await toggle(page, ".section-options");
  await page
    .getByLabel("Section notes · AI context")
    .fill("transitions: connect explicitly");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("transitions: make the pivot abrupt");
  const requestEvent = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  const sent = (await requestEvent).postDataJSON();
  expect(sent.readContext.resolvedStyle.effective.transitions).toMatchObject({
    value: "make the pivot abrupt",
    source: "current_instruction",
  });
  await focus(page, "Closer");
  await expect(page.locator(".style-context")).not.toContainText(
    "Short and unannounced.",
  );
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("two thoughts and contrasting scaffolds stay editable and stage without changing the section", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await focus(page, "Hook");
  await builder(page);
  await fillThoughts(page);
  await page.getByLabel("Logical relationship").selectOption("contrast");
  await page.getByLabel("Sentence scaffold").selectOption("contrast-direct");
  await expect(page.getByTestId("scaffold-preview")).toHaveText(
    "The software was useful, but it was too expensive.",
  );
  await page
    .getByRole("button", { name: "Stage for target", exact: true })
    .click();
  await expect(page.getByLabel("Edit proposal 1")).toHaveValue(
    "The software was useful, but it was too expensive.",
  );
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  await page.getByTestId("accept-proposal").click();
  await save(page);
  const saved = await stored(request, doc.id);
  expect(documentText({ ...saved, sections: [saved.sections[0]] })).toBe(
    "The software was useful, but it was too expensive.",
  );
  expect(saved.sections[1].content).toEqual(doc.sections[1].content);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I really liked the tool.",
  );
});
test("raw rant stays verbatim, thought units can fill slots, and structure reaches routed AI", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await focus(page, "Segue");
  await builder(page);
  await page
    .getByText("Start from a rant or raw notes", { exact: true })
    .click();
  const raw =
    "I liked the tool and it did what I needed but it was too expensive and I didn’t really realize how much I was spending until later.";
  await page.getByLabel("Raw thoughts").fill(raw);
  await page.getByRole("button", { name: "Find thought units" }).click();
  await expect(page.locator(".thought-unit")).toHaveCount(4);
  await expect(page.getByLabel("Raw thoughts")).toHaveValue(raw);
  const chunks = await page.locator(".thought-unit > p").allTextContents();
  expect(chunks.join("")).toBe(raw);
  await page
    .locator(".thought-unit")
    .first()
    .getByRole("button", { name: "Use as Thought A" })
    .click();
  await page
    .locator(".thought-unit")
    .nth(2)
    .getByRole("button", { name: "Use as Thought B" })
    .click();
  await page
    .getByLabel("Thought B · second thought")
    .fill("it was too expensive");
  await page.getByLabel("Logical relationship").selectOption("contrast");
  await page
    .getByText("Ask the model about this structure", { exact: true })
    .click();
  const event = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page
    .getByRole("button", { name: "Analyze relationship", exact: true })
    .click();
  const body = (await event).postDataJSON();
  expect(body.action).toBe("structure");
  expect(body.structure.draft.relationship).toBe("contrast");
  expect(body.structure.draft.raw).toBe(raw);
  expect(body.structure.scaffold).toContain("[X]");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("technical connector distinctions, favorites and avoids use the same library", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await focus(page, "Segue");
  await builder(page);
  await fillThoughts(page);
  await page.getByText("Why these connectors differ", { exact: true }).click();
  await expect(page.locator(".connector-intelligence")).toContainText(
    "that said",
  );
  await page.getByLabel("Structure register").selectOption("technical");
  await expect(page.locator(".connector-intelligence")).toContainText(
    "however",
  );
  await expect(page.locator(".connector-intelligence")).not.toContainText(
    "that said",
  );
  await expect(page.locator(".connector-intelligence")).toContainText(
    "comma alone",
  );
  await expect(
    page.getByLabel("Sentence scaffold").locator("option"),
  ).toContainText(["[X], but [Y].", "[X]; however, [Y]."]);
  await page
    .getByRole("button", { name: "Favorite however", exact: true })
    .click();
  await page.getByRole("button", { name: "Avoid except", exact: true }).click();
  await expect.poll(async () => (await library(request)).items.length).toBe(2);
  await expect(
    page.getByRole("button", { name: "Consider except", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Show avoided connectors").check();
  await expect(
    page.getByRole("button", { name: "Unhide except", exact: true }),
  ).toBeVisible();
  await save(page);
  await page.reload();
  await focus(page, "Segue");
  await builder(page);
  await expect(page.getByLabel("Structure register")).toHaveValue("technical");
  const lib = await library(request);
  expect(lib.items.find((i: any) => i.content === "however").preference).toBe(
    "like",
  );
  expect(lib.items.find((i: any) => i.content === "except").preference).toBe(
    "avoid",
  );
});
test("moves, scaffold patterns, custom tags and scoped guides survive library export/import", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await focus(page, "Closer");
  await builder(page);
  await page
    .getByRole("button", { name: "Save this move", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect.poll(async () => (await library(request)).items.length).toBe(2);
  await page
    .getByRole("button", { name: "Personal library", exact: true })
    .first()
    .click();
  await page.getByText("Library backup & import", { exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export library JSON" }).click();
  const file = await (await event).path();
  await page.getByTestId("library-import").setInputFiles(file!);
  await expect.poll(async () => (await library(request)).items.length).toBe(4);
  const lib = await library(request);
  expect(lib.items.filter((i: any) => i.kind === "move")).toHaveLength(2);
  expect(lib.items.filter((i: any) => i.kind === "pattern")).toHaveLength(2);
  expect(new Set(lib.items.map((i: any) => i.id)).size).toBe(4);
});
test("saved snippet use requires an explicit preview and acceptance; library surfacing alone changes nothing", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await focus(page, "Closer");
  await toggle(page, ".inspector > .quick-save");
  await page
    .getByRole("button", { name: "Save exact snippet", exact: true })
    .click();
  await expect.poll(async () => (await library(request)).items.length).toBe(1);
  await select(page, "cost");
  await page
    .getByRole("button", { name: "Personal library", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Preview for target", exact: true })
    .click();
  await expect(page.getByLabel("Edit proposal 1")).toHaveValue("que sera sera");
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  await page.getByTestId("accept-proposal").click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "It que sera sera too much.",
  );
  await expect
    .poll(async () => (await library(request)).items[0].useCount)
    .toBe(1);
});
test("builder stays section-local, usable in dark mode and scopes tightening to the original target", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await focus(page, "Hook");
  await builder(page);
  await fillThoughts(page);
  await focus(page, "Segue");
  await expect(page.getByLabel("Thought A · main thought")).toHaveValue("");
  await focus(page, "Hook");
  await expect(page.getByLabel("Thought A · main thought")).toHaveValue(
    "The software was useful",
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.getByTestId("scaffold-preview").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/thought-assembly-dark.png",
    fullPage: true,
  });
  await page
    .getByText("Ask the model about this structure", { exact: true })
    .click();
  await page.getByRole("button", { name: "Propose a tighter version" }).click();
  await expect(page.getByLabel("Edit proposal 1")).toBeVisible();
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});

test("content-type guide survives reload and drops out when the brief changes", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Style guides", exact: true }).click();
  await page.getByLabel("Guide scope").selectOption("content");
  await page.getByLabel("Content style guide").selectOption("narration");
  await page.getByLabel("Style preference key", { exact: true }).fill("rhythm");
  await page
    .getByLabel("Style preference", { exact: true })
    .fill("One breath, then a fragment.");
  await page.getByRole("button", { name: "Save style rule" }).click();
  await expect.poll(async () => (await library(request)).items.length).toBe(1);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await focus(page, "Hook");
  await toggle(page, ".style-context");
  await expect(page.locator(".style-context")).toContainText(
    "One breath, then a fragment.",
  );
  await page
    .getByRole("button", { name: "Writing brief", exact: true })
    .first()
    .click();
  await page.getByLabel("Content type").selectOption("article");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".style-context")).not.toContainText(
    "One breath, then a fragment.",
  );
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("saved pattern reloads into user-editable slots and Structure honors its task model", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const settings = await (await request.get("/api/settings")).json();
  settings.routing = {
    applicationDefault: null,
    sectionTypeDefaults: {},
    taskDefaults: { structure: { providerId: "mock", modelId: "plain" } },
  };
  await request.put("/api/settings", { data: settings });
  await open(page);
  await focus(page, "Hook");
  await builder(page);
  await fillThoughts(page);
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect.poll(async () => (await library(request)).items.length).toBe(1);
  await page
    .getByRole("button", { name: "Personal library", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use in builder", exact: true })
    .click();
  await expect(page.getByTestId("scaffold-preview")).toHaveText(
    "The software was useful, but it was too expensive.",
  );
  await page
    .getByLabel("Thought B · second thought")
    .fill("it was worth the cost");
  await expect(page.getByTestId("scaffold-preview")).toContainText(
    "it was worth the cost",
  );
  await page
    .getByText("Ask the model about this structure", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Analyze relationship", exact: true })
    .click();
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await expect(page.getByTestId("run-model")).toContainText("task");
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
