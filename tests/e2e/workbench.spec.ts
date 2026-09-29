import { readFileSync } from "node:fs";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { makeRevisionCheckpoint } from "../../apps/web/src/workspace-helpers";
import {
  newDocument,
  newSection,
  defaultSettings,
  documentText,
  targetFor,
  emptyWorkbench,
  paragraphs,
} from "../../packages/domain/src/index";
async function seed(
  request: APIRequestContext,
  text = "First sentence stays. I really utilize tools in order to help. Last sentence stays.",
) {
  const existing = [
    ...(await (await request.get("/api/documents")).json()),
    ...(await (await request.get("/api/documents/archived")).json()),
  ];
  for (const d of existing)
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("A place for my words", text);
  doc.sections[0].kind = "Hook";
  doc.sections[0].label = "Opening";
  doc.sections.push(
    newSection("Segue", "The connection is a consequence, not a slogan."),
  );
  doc.sections.push(newSection("Closer", "Leave this ending alone."));
  doc.sources = [
    {
      id: "source",
      title: "The actual words",
      kind: "quote",
      text: "A source quotation must not change.",
      url: "",
    },
  ];
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
async function select(page: Page, text: string, collapsed = false) {
  await page.getByTestId("writing-editor").evaluate(
    (root, { text, collapsed }) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const index = node.textContent?.indexOf(text) ?? -1;
        if (index < 0) continue;
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, collapsed ? index : index + text.length);
        selection.removeAllRanges();
        selection.addRange(range);
        (root as HTMLElement).focus();
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      throw new Error("Text not found: " + text);
    },
    { text, collapsed },
  );
}
async function diagnose(page: Page, action = "shorten") {
  await page.getByLabel("Writing action", { exact: true }).selectOption(action);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText("OFFLINE");
}
test("ordinary editing, native clipboard shortcuts, rich paste, undo and redo", async ({
  page,
  request,
}) => {
  await seed(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("Hello. ");
  await expect(editor).toContainText("Hello. First sentence stays.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("Hello.");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor).toContainText("Hello.");
  await select(page, "Hello.");
  await page.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Hello.");
  await page.keyboard.press("ControlOrMeta+x");
  await expect(editor).not.toContainText("Hello.");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor).toContainText("Hello.");
  await page.evaluate(() =>
    navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(
          ["<p><strong>External bold</strong> and <em>italic</em>.</p>"],
          { type: "text/html" },
        ),
        "text/plain": new Blob(["External bold and italic."], {
          type: "text/plain",
        }),
      }),
    ]),
  );
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+v");
  await expect(editor.locator("strong")).toHaveText("External bold");
  await page.keyboard.type(" Still editable.");
  await expect(editor).toContainText("Still editable.");
  await save(page);
  await page.reload();
  await expect(editor).toContainText("External bold");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  const selection = await page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  expect(selection).toContain("First sentence stays.");
  expect(selection).toContain("External bold");
  expect(selection).not.toContain("WRITING LAB");
  expect(errors).toEqual([]);
});
test("sentence diagnosis reads globally but proposal, copy and acceptance stay local; originals activate", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "I really utilize tools in order to help.", true);
  await expect(page.locator(".target-box")).toContainText(
    "I really utilize tools in order to help.",
  );
  const requests: any[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai")) requests.push(r.postDataJSON());
  });
  await diagnose(page);
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await page
    .getByLabel("Your material", { exact: true })
    .fill("Keep the observation; remove unnecessary words.");
  await page.getByRole("button", { name: "Propose options" }).click();
  const proposed = page.getByLabel("Edit proposal 1");
  await expect(proposed).toBeVisible();
  const text = await proposed.inputValue();
  await page
    .getByRole("button", { name: "Copy proposal 1", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(text);
  expect(requests[0].readContext.document.sections).toHaveLength(3);
  expect(requests[0].readContext.document.sources[0].text).toBe(
    doc.sources[0].text,
  );
  expect(requests[0].editTarget.scope).toBe("selection");
  await page.getByTestId("accept-proposal").first().click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "First sentence stays.",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Last sentence stays.",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone.",
  );
  await page.locator(".variants summary").click();
  await expect(page.getByLabel("Take text")).toHaveValue(/I really utilize/);
  await expect(page.getByLabel("Take name")).toHaveValue("Original target");
  await page.getByLabel("Take name").fill("My earlier line");
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("compare-original")).toHaveText(
    "I really utilize tools in order to help.",
  );
  await expect(page.getByTestId("compare-current")).not.toHaveText(
    "I really utilize tools in order to help.",
  );
  await expect(page.getByTestId("compare-take")).toHaveCount(0);
  await expect(page.getByTestId("variant-comparison")).toHaveCount(1);
  await expect(page.getByTestId("variant-comparison")).toContainText(
    "Current draft text",
  );
  await page
    .getByRole("button", { name: "Activate", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I really utilize tools in order to help.",
  );
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sources).toEqual(doc.sources);
  expect(stored.sections[0].variants.length).toBeGreaterThanOrEqual(2);
  expect(stored.sections[0].variants[0]).toMatchObject({
    label: "My earlier line",
    origin: "original",
    text: "I really utilize tools in order to help.",
    sourceTarget: { text: "I really utilize tools in order to help." },
  });
  expect(stored.history[0].state).toBe("accepted");
  await page.reload();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I really utilize",
  );
  await page.locator(".variants summary").click();
  await expect(page.getByLabel("Take name").first()).toHaveValue(
    "My earlier line",
  );
  await page
    .getByRole("button", { name: "Compare", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("compare-original")).toHaveText(
    "I really utilize tools in order to help.",
  );
  await expect(page.getByTestId("compare-current")).toContainText(
    "First sentence stays.",
  );
});
test("human Save take preserves two manual closers and switches them without a model call", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/ai")) calls.push(r.url());
  });
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  const takeNameInput = page.getByLabel("Take name (optional)");
  await expect(takeNameInput).toBeFocused();
  expect(
    await takeNameInput.evaluate(
      (input) => (input as HTMLInputElement).labels?.[0]?.textContent,
    ),
  ).toContain("Take name (optional)");
  await takeNameInput.press("Escape");
  await expect(takeNameInput).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "1 take", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await takeNameInput.fill("Calm");
  await takeNameInput.press("Enter");
  await expect(
    page.getByRole("button", { name: "1 take", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByRole("button", { name: "Save this take" }).click();
  await expect(page.getByRole("status")).toContainText(
    "This take is already saved",
  );
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave this ending alone!");
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Louder");
  await page.getByRole("button", { name: "Save this take" }).click();
  await page.getByRole("button", { name: "2 takes", exact: true }).click();
  const saved = page.locator(".variants .variant");
  await expect(saved).toHaveCount(2);
  await expect(saved.nth(0).getByLabel("Take name")).toHaveValue("Calm");
  await expect(saved.nth(1).getByLabel("Take name")).toHaveValue("Louder");
  await expect(saved.nth(1).getByTestId("take-current")).toHaveText("In draft");
  await expect(page.getByTestId("current-draft-state")).toContainText("Louder");
  await saved.nth(0).getByRole("button", { name: "Activate" }).click();
  await expect(saved.nth(0).getByTestId("take-current")).toHaveText("In draft");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone!",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone.",
  );
  await saved.nth(1).getByRole("button", { name: "Activate" }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone!",
  );
  await saved.nth(0).getByRole("button", { name: "Compare" }).click();
  await expect(page.getByTestId("compare-current")).toHaveText(
    "Leave this ending alone!",
  );
  await expect(
    page.getByTestId("compare-original").locator(".compare-removed"),
  ).toHaveText(".");
  await expect(
    page.getByTestId("compare-current").locator(".compare-added"),
  ).toHaveText("!");
  await expect(page.getByTestId("variant-comparison")).toContainText(
    "Calm · Saved by you",
  );
  await expect(page.getByTestId("variant-comparison")).not.toContainText(
    "original target",
  );
  await select(page, "Leave this ending alone!");
  await page.keyboard.insertText("Leave this ending alone!!");
  await expect(page.getByTestId("compare-current")).toHaveText(
    "Leave this ending alone!!",
  );
  await expect(page.getByTestId("take-current")).toHaveCount(0);
  await expect(page.getByTestId("current-draft-state")).toHaveText(
    "Current draft",
  );
  await expect(page.getByTestId("compare-original")).toHaveText(
    "Leave this ending alone.",
  );
  await saved.nth(0).getByRole("button", { name: "Activate" }).click();
  await expect(saved).toHaveCount(3);
  await expect(saved.nth(2).getByLabel("Take name")).toHaveValue("Take 3");
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.sections[2]).toMatchObject({
    id: doc.sections[2].id,
    kind: "Closer",
    label: "Closer",
    notes: "",
    placement: "draft",
  });
  expect(stored.sections.slice(0, 2).map((s: any) => s.content)).toEqual(
    doc.sections.slice(0, 2).map((s) => s.content),
  );
  expect(
    stored.sections[2].variants.map((v: any) => [v.label, v.origin]),
  ).toEqual([
    ["Calm", "human"],
    ["Louder", "human"],
    ["Take 3", "human"],
  ]);
  expect(calls).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "3 takes", exact: true }).click();
  await expect(page.locator(".variants .variant")).toHaveCount(3);
});

test("deleting a take that matches the draft leaves prose in place and marks Current draft", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Plain and fast");
  await page.getByLabel("Take name (optional)").press("Enter");
  await page.getByRole("button", { name: "1 take" }).click();
  await expect(page.getByTestId("current-draft-state")).toContainText(
    "Plain and fast",
  );
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Delete take" })
    .click();
  const prompt = page.getByRole("alertdialog", { name: "Delete take" });
  await expect(prompt).toContainText("Plain and fast");
  await prompt.getByRole("button", { name: "Delete take" }).click();
  await expect(page.getByTestId("current-draft-state")).toHaveText(
    "Current draft",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Leave this ending alone.",
  );
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.sections[2].variants).toEqual([]);
  expect(stored.sections[2].content).toEqual(doc.sections[2].content);
});

test("source removal needs confirmation and leaves authored prose untouched", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document sources" }).click();
  const dialog = page.getByRole("dialog", { name: "Source material" });
  const remove = dialog.getByRole("button", { name: "Remove source" });
  await expect(remove).toHaveAttribute("title", "Remove source");
  await remove.click();
  const prompt = dialog.getByRole("alertdialog", { name: "Remove source" });
  await expect(prompt).toContainText("The actual words");
  await prompt.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByLabel("Source text")).toHaveValue(
    doc.sources[0].text,
  );
  await remove.click();
  await prompt.getByRole("button", { name: "Remove source" }).click();
  await expect(dialog.getByLabel("Source text")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText("Removed source");
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.sources).toEqual([]);
  expect(stored.sections.map((s: any) => s.content)).toEqual(
    doc.sections.map((s) => s.content),
  );
});

test("take comparison emphasizes a changed word without rewriting the draft", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Before cut");
  await page.getByLabel("Take name (optional)").press("Enter");
  await select(page, "Leave");
  await page.keyboard.insertText("Hold");
  await page.getByRole("button", { name: "1 take", exact: true }).click();
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Compare" })
    .click();
  await expect(
    page.getByTestId("compare-original").locator(".compare-removed"),
  ).toHaveText("Leave");
  await expect(
    page.getByTestId("compare-current").locator(".compare-added"),
  ).toHaveText("Hold");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Hold this ending alone.",
  );
});

test("Saved takes identifies its owning section even with duplicate labels at narrow width", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.sections[0].label = "The other thread";
  doc.sections[2].label = "The other thread";
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await page.setViewportSize({ width: 700, height: 900 });
  await open(page);
  const owner = page.locator(`[data-section-id="${doc.sections[2].id}"]`);
  await owner.locator(".section-focus").click();
  await owner.getByRole("button", { name: "Save take" }).click();
  await page.getByLabel("Take name (optional)").fill("Kitchen table");
  await page.getByLabel("Take name (optional)").press("Enter");
  await owner.getByRole("button", { name: "1 take" }).click();
  await expect(page.locator(".variants > summary")).toContainText(
    "Saved takes · The other thread · Section 3",
  );
  await expect(page.getByTestId("current-draft-state")).toContainText(
    "In draft: Kitchen table",
  );
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave this ending alone!");
  await expect(page.getByTestId("current-draft-state")).toHaveText(
    "Current draft",
  );
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await page.reload();
  await owner.getByRole("button", { name: "1 take" }).click();
  await expect(page.locator(".variants > summary")).toContainText(
    "The other thread · Section 3",
  );
  await expect(page.getByTestId("current-draft-state")).toHaveText(
    "Current draft",
  );
});

test("substantial take rewrites leave shared phrases unmarked in read-only Compare", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const before =
    "The telemarketer called at work. Forty minutes later, I hung up and went back to my desk.";
  const after =
    "That telemarketer kept talking at work. Forty minutes vanished while I tried to finish my shift.";
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText(before);
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Before rewrite");
  await page.getByLabel("Take name (optional)").press("Enter");
  await page
    .locator(`.writing-editor > section[id="${doc.sections[2].id}"]`)
    .evaluate((element, text) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Node[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const whole = nodes.map((node) => node.textContent).join("");
      const start = whole.indexOf(text);
      if (start < 0) throw new Error("Saved wording is not in the section");
      let offset = 0,
        from: [Node, number] | null = null,
        to: [Node, number] | null = null;
      for (const node of nodes) {
        const length = node.textContent?.length ?? 0;
        if (!from && start >= offset && start < offset + length)
          from = [node, start - offset];
        if (start + text.length <= offset + length) {
          to = [node, start + text.length - offset];
          break;
        }
        offset += length;
      }
      if (!from || !to) throw new Error("Could not select the saved wording");
      const range = document.createRange();
      range.setStart(...from);
      range.setEnd(...to);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      (element.closest(".writing-editor") as HTMLElement).focus();
      document.dispatchEvent(new Event("selectionchange"));
    }, before);
  await page.keyboard.insertText(after);
  await page.getByRole("button", { name: "1 take" }).click();
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Compare" })
    .click();
  const original = page.getByTestId("compare-original"),
    current = page.getByTestId("compare-current");
  await expect(original).toHaveText(before);
  await expect(current).toHaveText(after);
  for (const phrase of ["telemarketer", "at work", "Forty minutes"]) {
    await expect(current).toContainText(phrase);
    expect(
      (await current.locator(".compare-added").allTextContents()).join(""),
    ).not.toContain(phrase);
    expect(
      (await original.locator(".compare-removed").allTextContents()).join(""),
    ).not.toContain(phrase);
  }
  await expect(page.getByTestId("writing-editor")).toContainText(after);
  await save(page);
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json()).sections[2]
      .variants[0].text,
  ).toBe(before);
});

test("take activation copy does not append punctuation to a writer's name", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Unhinged 2 a.m.");
  await page.getByLabel("Take name (optional)").press("Enter");
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Another closer.");
  await page.getByRole("button", { name: "1 take", exact: true }).click();
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Activated Unhinged 2 a.m.",
  );
  await expect(page.getByRole("status")).not.toContainText("a.m..");
});

test("saved take stays with its section through rename, role, reorder, park, include and duplicate", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[2].id;
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByRole("button", { name: "Save this take" }).click();
  await page.getByRole("button", { name: "1 take", exact: true }).click();
  await expect(
    page.locator(".variants .variant").getByLabel("Take name"),
  ).toHaveValue("Take 1");
  await page
    .locator(".variants .variant")
    .getByLabel("Take name")
    .fill("Before cut");
  await page
    .locator(`[data-section-id="${id}"] .section-options > summary`)
    .click();
  await page.getByLabel("Label", { exact: true }).fill("Ending note");
  await page.getByLabel("Semantic kind").selectOption("Point");
  await page.getByRole("button", { name: "Move section up" }).click();
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await page.getByRole("button", { name: "Park thought" }).click();
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await page.getByRole("button", { name: "Include in draft" }).click();
  await page.getByLabel("Draft position").selectOption("__end__");
  await page.getByRole("button", { name: "Include here" }).click();
  await save(page);
  const retained = (
    await (await request.get(`/api/documents/${doc.id}`)).json()
  ).sections.find((section: any) => section.id === id);
  expect(retained).toMatchObject({
    label: "Ending note",
    kind: "Point",
    placement: "draft",
    variants: [
      { label: "Before cut", origin: "human", target: { sectionId: id } },
    ],
  });
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  const options = page.locator(`[data-section-id="${id}"] .section-options`);
  if (
    !(await options.evaluate((element) => (element as HTMLDetailsElement).open))
  )
    await options.locator("summary").click();
  await page.getByRole("button", { name: "Duplicate section" }).click();
  await save(page);
  const stored = (await (await request.get(`/api/documents/${doc.id}`)).json())
    .sections;
  const copy = stored.find(
    (section: any) => section.label === "Ending note — copy",
  );
  expect(copy.variants[0]).toMatchObject({
    label: "Before cut",
    origin: "human",
    target: { sectionId: copy.id },
  });
  expect(copy.variants[0].id).not.toBe(retained.variants[0].id);
  expect(stored.find((section: any) => section.id === id).variants[0].id).toBe(
    retained.variants[0].id,
  );
  await page.locator(`[data-section-id="${copy.id}"] .section-focus`).click();
  await page
    .locator(`[data-section-id="${copy.id}"] .card-saved-work`)
    .getByRole("button", { name: "1 take", exact: true })
    .click();
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Copy take" })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Leave this ending alone.");
  const deleteTake = page
    .locator(".variants .variant")
    .getByRole("button", { name: "Delete take" });
  await expect(deleteTake).toHaveAttribute("title", "Delete take");
  await deleteTake.click();
  const prompt = page.getByRole("alertdialog", { name: "Delete take" });
  await expect(prompt).toContainText("Before cut");
  await expect(page.locator(".variants .variant")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await deleteTake.click();
  await prompt.getByRole("button", { name: "Delete take" }).click();
  await expect(page.getByRole("status")).toContainText("Deleted take");
  await save(page);
  const after = (await (await request.get(`/api/documents/${doc.id}`)).json())
    .sections;
  expect(after.find((section: any) => section.id === copy.id).variants).toEqual(
    [],
  );
  expect(after.find((section: any) => section.id === id).variants[0].id).toBe(
    retained.variants[0].id,
  );
});

test("splitting leaves saved takes only on the original half", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const id = doc.sections[2].id;
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Before split");
  await page.getByRole("button", { name: "Save this take" }).click();
  await select(page, "alone.", true);
  await page.getByRole("button", { name: "Split section at cursor" }).click();
  await save(page);
  const sections = (
    await (await request.get(`/api/documents/${doc.id}`)).json()
  ).sections;
  const index = sections.findIndex((section: any) => section.id === id);
  expect(sections[index].variants).toMatchObject([
    { label: "Before split", origin: "human", target: { sectionId: id } },
  ]);
  expect(sections[index + 1].variants).toEqual([]);
  expect(sections[index + 1].id).not.toBe(id);
});

test("word inspection and section lab use exact targets; critique never edits", async ({
  page,
  request,
}) => {
  const doc = await seed(
    request,
    "I assumed the door was open. Another sentence.",
  );
  await open(page);
  await select(page, "assumed");
  await expect(page.locator(".lab-head")).toContainText("Word intelligence");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(
    page.getByRole("heading", { name: "figured", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "01 Opening" }).click();
  await expect(page.locator(".lab-head")).toContainText("Hook workbench");
  await expect(page.locator(".target-box")).toContainText("Another sentence.");
  await page.getByRole("button", { name: "Whole-piece critique" }).click();
  await expect(page.locator(".response")).toContainText("WHOLE-PIECE ANALYSIS");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await save(page);
  const authored = (sections: typeof doc.sections) =>
    sections.map(({ id, kind, label, notes, content }) => ({
      id,
      kind,
      label,
      notes,
      content,
    }));
  expect(
    authored(
      (await (await request.get("/api/documents/" + doc.id)).json()).sections,
    ),
  ).toEqual(authored(doc.sections));
});
test("drag/reorder preserves metadata and save survives reload; split and merge work", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const items = page.getByTestId("structure-item");
  await items.nth(2).scrollIntoViewIfNeeded();
  const firstHeight = (await items.first().boundingBox())!.height;
  await items
    .nth(2)
    .dragTo(items.nth(0), { targetPosition: { x: 20, y: firstHeight - 12 } });
  await expect(items.nth(0)).toHaveAttribute(
    "data-section-id",
    doc.sections[2].id,
  );
  await save(page);
  await page.reload();
  await expect(items.nth(0)).toHaveAttribute(
    "data-section-id",
    doc.sections[2].id,
  );
  await select(page, "Last sentence stays.", true);
  await page.getByRole("button", { name: "Split section at cursor" }).click();
  await expect(items).toHaveCount(4);
  await expect(page.getByTestId("writing-editor")).toContainText(
    "First sentence stays.",
  );
  await page
    .getByRole("button", { name: /Opening/ })
    .first()
    .click();
  await page.locator(".section-options summary").click();
  await page.getByRole("button", { name: "Merge with next section" }).click();
  await expect(items).toHaveCount(3);
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sections.map((s: any) => s.kind)).toEqual([
    "Closer",
    "Hook",
    "Segue",
  ]);
});
test("Style DNA clean close is immediate but unsaved changes require a discard decision", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  const openStyle = () =>
    page.getByRole("button", { name: "Style DNA", exact: true }).click();
  await openStyle();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await openStyle();
  const rhythm = page.getByLabel("Rhythm", { exact: true });
  const original = await rhythm.inputValue();
  await rhythm.fill("A more deliberate rhythm.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  const prompt = page.getByRole("alertdialog", {
    name: "Unsaved Style DNA changes",
  });
  await expect(prompt).toContainText("Discard changes");
  await prompt.getByRole("button", { name: "Keep editing" }).click();
  await expect(rhythm).toHaveValue("A more deliberate rhythm.");
  await page.keyboard.press("Escape");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Discard changes" }).click();
  await expect(
    page.getByRole("dialog", { name: "Style DNA & knowledge" }),
  ).toHaveCount(0);
  await openStyle();
  await expect(page.getByLabel("Rhythm", { exact: true })).toHaveValue(
    original,
  );
});

test("Style DNA and brief persist; source never becomes authored text; light and dark readable", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Style DNA", exact: true }).click();
  await page
    .getByLabel("Rhythm", { exact: true })
    .fill("Fragments. Then a long breath.");
  await page.getByRole("button", { name: "Save voice preferences" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Writing brief", exact: true })
    .first()
    .click();
  await page.getByLabel("Content type").selectOption("reply");
  await page
    .getByLabel("Desired length", { exact: true })
    .fill("One sentence is enough.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Style DNA", exact: true }).click();
  await expect(page.getByLabel("Rhythm", { exact: true })).toHaveValue(
    "Fragments. Then a long breath.",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.screenshot({
    path: "artifacts/verified-dark.png",
    fullPage: true,
  });
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.brief.contentType).toBe("reply");
  expect(documentText(stored)).not.toContain(doc.sources[0].text);
  expect(documentText(stored)).toBe(documentText(doc));
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await page.screenshot({
    path: "artifacts/verified-light.png",
    fullPage: true,
  });
  const css = await page.getByTestId("writing-editor").evaluate((e) => ({
    font: parseFloat(getComputedStyle(e).fontSize),
    line: parseFloat(getComputedStyle(e).lineHeight),
    overflow: document.body.scrollWidth > innerWidth,
  }));
  expect(css.font).toBeGreaterThanOrEqual(22);
  expect(css.line / css.font).toBeGreaterThanOrEqual(1.6);
  expect(css.overflow).toBe(false);
});
test("stale proposals cannot overwrite manual edits", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await select(page, "I really utilize tools in order to help.");
  await diagnose(page);
  await page.getByLabel("Your material", { exact: true }).fill("Shorten this.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("proposal")).toBeVisible();
  await page.getByTestId("writing-editor").click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.type("My new thought. ");
  await page.getByTestId("accept-proposal").first().click();
  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "My new thought.",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I really utilize",
  );
});
test("last selected document survives A to B to A, reload and a fresh app view", async ({
  page,
  request,
}) => {
  const a = await seed(request);
  const b = await (
    await request.post("/api/import", {
      data: { document: newDocument("Other draft", "Another document.") },
    })
  ).json();
  await open(page);
  const picker = page.getByLabel("Switch document");
  await picker.selectOption(a.id);
  await picker.selectOption(b.id);
  await picker.selectOption(a.id);
  await page.reload();
  await expect(picker).toHaveValue(a.id);
  await page.getByLabel("Document title").fill("The Museum of Almost");
  await save(page);
  await page.reload();
  await expect(picker).toHaveValue(a.id);
  await expect(page.getByLabel("Document title")).toHaveValue(
    "The Museum of Almost",
  );
  const reopened = await page.context().newPage();
  await reopened.goto("/");
  await expect(reopened.getByLabel("Switch document")).toHaveValue(a.id);
  await reopened.close();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(picker).not.toHaveValue(a.id);
  const newId = await picker.inputValue();
  await page.reload();
  await expect(picker).toHaveValue(newId);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(picker).not.toHaveValue(newId);
  const fallback = await picker.inputValue();
  expect([a.id, b.id]).toContain(fallback);
  await page.reload();
  await expect(picker).toHaveValue(fallback);
});

for (const width of [1440, 1024, 700])
  test(`Piece memory has a quiet document control at ${width}px for blank and changed memory`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 });
    await open(page);
    const aiRequests: string[] = [];
    page.on("request", (event) => {
      if (event.url().endsWith("/api/ai")) aiRequests.push(event.url());
    });
    const control = page.getByTestId("piece-memory-entry");
    await expect(control).toBeVisible();
    await expect(control).toHaveAccessibleName("Piece memory");
    await expect(control).not.toContainText("Draft changed");
    await page.getByRole("button", { name: /^03 Closer$/ }).click();
    await select(page, "Leave this ending alone.");
    await page.keyboard.insertText("Leave it quiet.");
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    await expect(control).toHaveAccessibleName("Piece memory");
    const prose = documentText(
      await (await request.get(`/api/documents/${doc.id}`)).json(),
    );
    const originalRevision = (
      await (await request.get(`/api/documents/${doc.id}`)).json()
    ).revision;
    await control.focus();
    await control.press("Enter");
    const memory = page.getByRole("dialog", { name: "Piece memory" });
    await expect(memory).toBeVisible();
    await expect(
      page.locator(`[data-section-id="${doc.sections[2].id}"]`),
    ).toHaveClass(/active/);
    await expect(page.getByTestId("writing-editor")).not.toBeFocused();
    await memory.getByRole("button", { name: "Close dialog" }).click();
    await expect
      .poll(
        async () =>
          (await (await request.get(`/api/documents/${doc.id}`)).json())
            .revision,
      )
      .toBe(originalRevision);
    expect(
      documentText(
        await (await request.get(`/api/documents/${doc.id}`)).json(),
      ),
    ).toBe(prose);
    await page.getByTestId("piece-memory-entry").click();
    await memory
      .getByLabel("Purpose")
      .fill("Leave the narrator room to notice.");
    await memory.getByRole("button", { name: "Close dialog" }).click();
    await expect(control).toHaveAccessibleName("Piece memory");
    await expect(page.getByRole("note")).toHaveCount(0);
    await page.getByRole("button", { name: /^03 Closer$/ }).click();
    await select(page, "Leave it quiet.");
    await page.keyboard.insertText("Leave it unresolved.");
    await expect(control).toHaveAccessibleName("Piece memory, draft changed");
    await expect(control).toContainText("Draft changed");
    await expect(page.getByRole("note")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await control.click();
    await expect(
      memory.getByText("Draft changed since this memory was last updated."),
    ).toBeVisible();
    await memory.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(control).toHaveAccessibleName("Piece memory");
    await memory.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    await page.reload();
    await expect(control).toHaveAccessibleName("Piece memory");
    expect(aiRequests).toHaveLength(0);
  });

test("Piece memory entry follows per-document freshness through switch, duplicate and archive restore", async ({
  page,
  request,
}) => {
  const first = await seed(request);
  first.pieceMemory.purpose = "Preserve the precise ending.";
  await request.put(`/api/documents/${first.id}`, { data: first });
  const saved = await (await request.get(`/api/documents/${first.id}`)).json();
  saved.sections[2].content = paragraphs("A changed ending.");
  await request.put(`/api/documents/${first.id}`, { data: saved });
  const other = await (
    await request.post("/api/import", {
      data: { document: newDocument("Other draft", "Unrelated prose.") },
    })
  ).json();
  await open(page);
  const entry = page.getByTestId("piece-memory-entry"),
    picker = page.getByLabel("Switch document");
  await picker.selectOption(first.id);
  await expect(entry).toHaveAccessibleName("Piece memory, draft changed");
  await picker.selectOption(other.id);
  await expect(entry).toHaveAccessibleName("Piece memory");
  await picker.selectOption(first.id);
  await expect(entry).toHaveAccessibleName("Piece memory, draft changed");
  await page.reload();
  await expect(picker).toHaveValue(first.id);
  await expect(entry).toHaveAccessibleName("Piece memory, draft changed");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(() => picker.inputValue()).not.toBe(first.id);
  await expect(entry).toHaveAccessibleName("Piece memory, draft changed");
  await picker.selectOption(first.id);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Archive document" }).click();
  await page
    .getByRole("dialog", { name: /Archive/ })
    .getByRole("button", { name: "Archive document" })
    .click();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage
    .locator(`[data-managed-id="${first.id}"]`)
    .getByRole("button", { name: /Restore/ })
    .click();
  await manage.getByRole("button", { name: "Close dialog" }).click();
  await picker.selectOption(first.id);
  await expect(entry).toHaveAccessibleName("Piece memory, draft changed");
});

test("a revision-plan jump leaves only that section's active notes at the Workbench work site", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const closer = doc.sections[2].id;
  doc.revisionPlan = [
    {
      id: "closer-first",
      sectionId: closer,
      text: "Does the reveal arrive too early?",
      createdAt: doc.createdAt,
      completedAt: null,
    },
    {
      id: "hook",
      sectionId: doc.sections[0].id,
      text: "Keep the first sentence restrained.",
      createdAt: doc.createdAt,
      completedAt: null,
    },
    {
      id: "closer-second",
      sectionId: closer,
      text: "Read the final line aloud.",
      createdAt: new Date(Date.parse(doc.createdAt) + 1000).toISOString(),
      completedAt: null,
    },
    {
      id: "closer-done",
      sectionId: closer,
      text: "Already considered this rhythm.",
      createdAt: doc.createdAt,
      completedAt: doc.createdAt,
    },
  ];
  doc.pieceMemory.nextMove = "Review the closer.";
  doc.pieceMemory.nextMoveSectionId = closer;
  doc.revisionCheckpoint = makeRevisionCheckpoint(doc, doc.draftRevision);
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await open(page);
  const local = page.getByRole("region", {
    name: "Revision notes for active section",
  });
  await expect(local).toContainText("Keep the first sentence restrained.");
  await expect(local).not.toContainText("Does the reveal arrive too early?");
  await page.getByRole("button", { name: /Revision plan/ }).click();
  const global = page.getByRole("dialog", { name: "Revision plan" });
  await global
    .getByTestId("revision-intention")
    .filter({ hasText: "Does the reveal arrive too early?" })
    .getByRole("button", { name: "Edit note" })
    .click();
  await expect(
    global
      .getByTestId("revision-intention")
      .filter({ hasText: "03 · Closer" })
      .first()
      .getByLabel("Edit revision note"),
  ).toBeFocused();
  await global.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: /Revision plan/ }).click();
  await global
    .getByTestId("revision-intention")
    .filter({ hasText: "Does the reveal arrive too early?" })
    .getByRole("button", { name: "Go to section" })
    .click();
  await expect(page.locator(`[data-section-id="${closer}"]`)).toHaveClass(
    /active/,
  );
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(local).toContainText("Revision notes · 2");
  await local.locator("summary").click();
  const notes = local.getByTestId("local-revision-intention");
  await expect(notes).toHaveCount(2);
  await expect(notes.nth(0)).toContainText("Does the reveal arrive too early?");
  await expect(notes.nth(1)).toContainText("Read the final line aloud.");
  await expect(local).not.toContainText("Already considered this rhythm.");
  await expect(local).not.toContainText("Keep the first sentence restrained.");
  await notes.nth(0).getByRole("button", { name: "Edit note" }).click();
  await expect(notes.nth(0).getByLabel("Edit revision note")).toBeFocused();
  await notes
    .nth(0)
    .getByLabel("Edit revision note")
    .fill("Does this reveal still land too early?");
  await notes.nth(0).getByRole("button", { name: "Save note" }).click();
  await expect(notes.nth(0)).toContainText(
    "Does this reveal still land too early?",
  );
  await notes.nth(1).getByRole("button", { name: "Done" }).click();
  await expect(notes).toHaveCount(1);
  await expect(local).not.toContainText("Read the final line aloud.");
  await page.getByRole("button", { name: /Revision plan/ }).click();
  await expect(global).toContainText("2 active");
  await global.getByText("Show completed").click();
  await global
    .getByTestId("revision-intention")
    .filter({ hasText: "Read the final line aloud." })
    .getByRole("button", { name: "Reopen" })
    .click();
  await global.getByRole("button", { name: "Close dialog" }).click();
  await expect(local).toContainText("Revision notes · 2");
  await page
    .locator(".piece-next-move")
    .getByRole("button", { name: "Go to section" })
    .click();
  await expect(local).toContainText("Does this reveal still land too early?");
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await save(page);
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(
    saved.revisionPlan.find((note: any) => note.id === "closer-first"),
  ).toMatchObject({
    text: "Does this reveal still land too early?",
    sectionId: closer,
  });
  expect(saved.pieceMemory).toEqual(doc.pieceMemory);
  expect(saved.revisionCheckpoint).toEqual(doc.revisionCheckpoint);
  expect(documentText(saved)).toBe(documentText(doc));
  expect(calls).toHaveLength(0);
});

for (const width of [1440, 1024, 700])
  test(`active Workbench revision note follows ordinary and resume navigation at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    doc.revisionPlan = [
      {
        id: "closer-note",
        sectionId: doc.sections[2].id,
        text: "Read this ending aloud before cutting it.",
        createdAt: doc.createdAt,
        completedAt: null,
      },
    ];
    doc.pieceMemory.nextMove = "Revisit the closer.";
    doc.pieceMemory.nextMoveSectionId = doc.sections[2].id;
    doc.revisionCheckpoint = makeRevisionCheckpoint(doc, doc.draftRevision);
    await request.put(`/api/documents/${doc.id}`, { data: doc });
    const calls: string[] = [];
    page.on("request", (event) => {
      if (event.url().endsWith("/api/ai")) calls.push(event.url());
    });
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const local = page.getByRole("region", {
      name: "Revision notes for active section",
    });
    await expect(local).toHaveCount(0);
    await page.getByRole("button", { name: /^03 Closer$/ }).click();
    await expect(local).toContainText("Revision note · 1");
    await expect(local).toContainText(
      "Read this ending aloud before cutting it.",
    );
    await page.getByRole("button", { name: /^01 Opening$/ }).click();
    await expect(local).toHaveCount(0);
    await page
      .locator(".piece-next-move")
      .getByRole("button", { name: "Go to section" })
      .click();
    await expect(local).toContainText(
      "Read this ending aloud before cutting it.",
    );
    await expect(page.getByTestId("writing-editor")).not.toBeFocused();
    await page
      .getByRole("button", { name: "Document View", exact: true })
      .click();
    await expect(local).toHaveCount(0);
    await page.getByRole("button", { name: "Workbench", exact: true }).click();
    await expect(local).toContainText(
      "Read this ending aloud before cutting it.",
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(saved.revisionPlan).toEqual(doc.revisionPlan);
    expect(saved.pieceMemory).toEqual(doc.pieceMemory);
    expect(saved.revisionCheckpoint).toEqual(doc.revisionCheckpoint);
    expect(documentText(saved)).toBe(documentText(doc));
    expect(calls).toHaveLength(0);
  });

test("local revision note survives reorder and rename, disappears on deletion, and returns with the same section ID", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const linkedId = doc.sections[2].id;
  doc.revisionPlan = [
    {
      id: "note",
      sectionId: linkedId,
      text: "Read this ending aloud.",
      createdAt: doc.createdAt,
      completedAt: null,
    },
  ];
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  const local = page.getByRole("region", {
    name: "Revision notes for active section",
  });
  await expect(local).toContainText("Read this ending aloud.");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  let current = await (await request.get(`/api/documents/${doc.id}`)).json();
  const returning = current.sections.pop();
  returning.label = "Ending";
  returning.kind = "Point";
  current.sections.unshift(returning);
  await request.put(`/api/documents/${doc.id}`, { data: current });
  await page.reload();
  await page.getByRole("button", { name: /^01 Ending$/ }).click();
  await expect(local).toContainText("Read this ending aloud.");
  current = await (await request.get(`/api/documents/${doc.id}`)).json();
  current.sections = current.sections.filter(
    (section: any) => section.id !== linkedId,
  );
  await request.put(`/api/documents/${doc.id}`, { data: current });
  await page.reload();
  await expect(local).toHaveCount(0);
  await page.getByRole("button", { name: /Revision plan/ }).click();
  const global = page.getByRole("dialog", { name: "Revision plan" });
  await expect(global).toContainText("Linked section no longer exists");
  await expect(global).toContainText("Read this ending aloud.");
  await global.getByRole("button", { name: "Close dialog" }).click();
  current = await (await request.get(`/api/documents/${doc.id}`)).json();
  current.sections.unshift(returning);
  await request.put(`/api/documents/${doc.id}`, { data: current });
  await page.reload();
  await page.getByRole("button", { name: /^01 Ending$/ }).click();
  await expect(local).toContainText("Read this ending aloud.");
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json())
      .revisionPlan[0].sectionId,
  ).toBe(linkedId);
});

test("writer-created revision notes remain section-local, recoverable and prose-safe", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Return to the piece later.";
  doc.revisionCheckpoint = makeRevisionCheckpoint(doc, doc.draftRevision);
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await open(page);
  await page
    .getByRole("button", { name: "Revision plan", exact: true })
    .click();
  const plan = page.getByRole("dialog", { name: "Revision plan" });
  await expect(plan).toContainText("0 active");
  await plan
    .getByLabel("Section for revision note")
    .selectOption(doc.sections[2].id);
  await plan
    .getByRole("textbox", { name: "Revision note", exact: true })
    .fill("Decide whether the ending explains itself.");
  await plan.getByRole("button", { name: "Add revision note" }).click();
  const item = plan.getByTestId("revision-intention");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("03 · Closer");
  await expect(item).toContainText(
    "Decide whether the ending explains itself.",
  );
  await item.getByRole("button", { name: "Edit note" }).click();
  await item
    .getByLabel("Edit revision note")
    .fill("Read the final line aloud.");
  await expect(item.getByLabel("Edit note section")).toHaveValue(
    doc.sections[2].id,
  );
  await item.getByRole("button", { name: "Save note" }).click();
  await expect(item).toContainText("03 · Closer");
  await expect(item).toContainText("Read the final line aloud.");
  await item.getByRole("button", { name: "Edit note" }).click();
  await expect(item.getByLabel("Edit revision note")).toHaveValue(
    "Read the final line aloud.",
  );
  await item.getByLabel("Edit note section").selectOption(doc.sections[1].id);
  await item.getByRole("button", { name: "Save note" }).click();
  await expect(item).toContainText("02 · Segue");
  await expect(item).toContainText("Read the final line aloud.");
  await item.getByRole("button", { name: "Done" }).click();
  await expect(plan).toContainText("0 active");
  await plan.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Revision plan", exact: true })
    .click();
  await expect(plan).toContainText("0 active");
  await plan.getByText("Show completed").click();
  await expect(item).toContainText("Read the final line aloud.");
  await item.getByRole("button", { name: "Reopen" }).click();
  await expect(plan).toContainText("1 active");
  await plan.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByRole("button", { name: /Revision plan/ }).click();
  await item.getByRole("button", { name: "Go to section" }).click();
  await expect(
    page.locator(`[data-section-id="${doc.sections[1].id}"]`),
  ).toHaveClass(/active/);
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.revisionPlan).toMatchObject([
    {
      sectionId: doc.sections[1].id,
      text: "Read the final line aloud.",
      completedAt: null,
    },
  ]);
  expect(saved.pieceMemory).toEqual(doc.pieceMemory);
  expect(saved.revisionCheckpoint).toEqual(doc.revisionCheckpoint);
  expect(documentText(saved)).toBe(documentText(doc));
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: /Revision plan/ }).click();
  await plan
    .getByTestId("revision-intention")
    .getByRole("button", { name: "Remove note" })
    .click();
  await expect(plan.getByTestId("revision-intention")).toHaveCount(0);
});

for (const width of [1440, 1024, 700])
  test(`revision intentions follow section identity across metadata edits and deletion at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    doc.revisionPlan = [
      {
        id: "note",
        sectionId: doc.sections[2].id,
        text: "Ask whether this ending explains itself.",
        createdAt: doc.createdAt,
        completedAt: null,
      },
    ];
    await request.put(`/api/documents/${doc.id}`, { data: doc });
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const plan = page.getByRole("dialog", { name: "Revision plan" });
    const openPlan = async () => {
      if (width <= 900) {
        await page.getByRole("button", { name: "Document actions" }).click();
        await page
          .getByRole("group", { name: "Document commands" })
          .getByRole("button", { name: "Revision plan" })
          .click();
      } else await page.getByRole("button", { name: /Revision plan/ }).click();
    };
    await openPlan();
    await expect(plan.getByTestId("revision-intention")).toContainText(
      "03 · Closer",
    );
    await plan.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    let current = await (await request.get(`/api/documents/${doc.id}`)).json();
    const linked = current.sections.pop();
    linked.kind = "Point";
    linked.label = "Ending";
    current.sections.unshift(linked);
    await request.put(`/api/documents/${doc.id}`, { data: current });
    await page.reload();
    await openPlan();
    await expect(plan.getByTestId("revision-intention")).toContainText(
      "01 · Ending · Point",
    );
    await plan.getByRole("button", { name: "Close dialog" }).click();
    current = await (await request.get(`/api/documents/${doc.id}`)).json();
    current.sections = current.sections.filter(
      (section: any) => section.id !== linked.id,
    );
    await request.put(`/api/documents/${doc.id}`, { data: current });
    await page.reload();
    await openPlan();
    const item = plan.getByTestId("revision-intention");
    await expect(item).toContainText("Linked section no longer exists");
    await expect(item).toContainText(
      "Ask whether this ending explains itself.",
    );
    await expect(
      item.getByRole("button", { name: "Go to section" }),
    ).toHaveCount(0);
    await plan.getByRole("button", { name: "Close dialog" }).click();
    current = await (await request.get(`/api/documents/${doc.id}`)).json();
    current.sections.unshift(linked);
    await request.put(`/api/documents/${doc.id}`, { data: current });
    await page.reload();
    await openPlan();
    await expect(item).toContainText("01 · Ending · Point");
    await expect(
      item.getByRole("button", { name: "Go to section" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(saved.revisionPlan[0].sectionId).toBe(linked.id);
    expect(saved.revisionPlan[0].completedAt).toBeNull();
  });

test("a writer-set revision checkpoint reviews changed sections and replaces only with confirmation", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Return to the ending.";
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await open(page);
  await page.getByRole("button", { name: "Revision", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Revision" });
  await expect(review.getByText("No changes since checkpoint")).toHaveCount(0);
  await review
    .getByLabel("Checkpoint note (optional)")
    .fill("Before tightening ending");
  await review.getByRole("button", { name: "Set revision checkpoint" }).click();
  await expect(review).toContainText("No changes since checkpoint");
  await expect(review).toContainText("Before tightening ending");
  await review.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  let saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.revisionCheckpoint.sections[2].text).toBe(
    "Leave this ending alone.",
  );
  expect(saved.pieceMemory.reviewedDraftRevision).toBe(
    doc.pieceMemory.reviewedDraftRevision,
  );
  expect(documentText(saved)).toBe(documentText(doc));
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave this ending open.");
  await expect(
    page.getByRole("button", { name: /Revision · Changes since checkpoint/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Revision · Changes since checkpoint/ })
    .click();
  await review.getByRole("button", { name: "Review changes" }).click();
  await expect(review.getByTestId("revision-change")).toHaveCount(1);
  await expect(review.getByTestId("revision-change")).toContainText("Edited");
  await expect(review.getByTestId("revision-change")).toContainText("Before:");
  await expect(review.getByTestId("revision-change")).toContainText("Now:");
  await review.getByRole("button", { name: "Go to section" }).click();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(`[data-section-id="${doc.sections[2].id}"]`),
  ).toHaveClass(/active/);
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await page
    .getByRole("button", { name: /Revision · Changes since checkpoint/ })
    .click();
  await review
    .getByRole("button", { name: "Set current draft as new checkpoint" })
    .click();
  await expect(review).toContainText("Replace the current revision checkpoint");
  await review.getByRole("button", { name: "Cancel" }).click();
  await expect(review).toContainText("Changes since checkpoint");
  await review
    .getByRole("button", { name: "Set current draft as new checkpoint" })
    .click();
  await review.getByRole("button", { name: "Replace checkpoint" }).click();
  await expect(review).toContainText("No changes since checkpoint");
  await review.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.revisionCheckpoint.sections[2].text).toBe(
    "Leave this ending open.",
  );
  expect(saved.pieceMemory.reviewedDraftRevision).toBe(
    doc.pieceMemory.reviewedDraftRevision,
  );
  expect(calls).toHaveLength(0);
});

test("Revision returns to clean after undoing a suppressed punctuation edit", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await open(page);
  await page.getByRole("button", { name: "Revision", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Revision" });
  await review.getByRole("button", { name: "Set revision checkpoint" }).click();
  await review.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  await select(page, "First sentence stays.");
  await page.keyboard.insertText("First sentence stays,");
  await expect(
    page.getByRole("button", { name: /Revision · Changes since checkpoint/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Revision · Changes since checkpoint/ })
    .click();
  await review.getByRole("button", { name: "Review changes" }).click();
  await expect(review.getByTestId("revision-change")).toHaveCount(0);
  await expect(review).toContainText(
    "No section-level changes passed the low-noise comparison.",
  );
  await review.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /Revision · No changes since checkpoint/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Revision · No changes since checkpoint/ })
    .click();
  await review.getByRole("button", { name: "Review changes" }).click();
  await expect(review).toContainText(
    "No section-level changes since this checkpoint.",
  );
  await review.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.draftRevision).toBeGreaterThan(
    saved.revisionCheckpoint.draftRevision,
  );
  expect(documentText(saved)).toBe(documentText(doc));
  expect(saved.pieceMemory).toEqual(doc.pieceMemory);
  expect(calls).toHaveLength(0);
});

for (const width of [1440, 1024, 700])
  test(`checkpoint review distinguishes structural changes and removed history at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    doc.revisionCheckpoint = makeRevisionCheckpoint(
      doc,
      doc.draftRevision,
      "Before moving ending",
    );
    await request.put(`/api/documents/${doc.id}`, { data: doc });
    const current = await (
      await request.get(`/api/documents/${doc.id}`)
    ).json();
    const [opening, middle, closer] = current.sections;
    closer.content = paragraphs("An ending with a different object.");
    opening.label = "Beginning";
    opening.kind = "Evidence";
    const added = newSection("Freeform", "Newly added thought.");
    current.sections = [closer, opening, added];
    await request.put(`/api/documents/${doc.id}`, { data: current });
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page
      .getByRole("button", { name: /Revision · Changes since checkpoint/ })
      .click();
    const review = page.getByRole("dialog", { name: "Revision" });
    await review.getByRole("button", { name: "Review changes" }).click();
    const changes = review.getByTestId("revision-change");
    await expect(changes).toHaveCount(4);
    await expect(
      changes.filter({ hasText: "An ending with a different object." }),
    ).toContainText("Edited · Moved");
    await expect(
      changes.filter({ hasText: "Beginning · Evidence" }),
    ).toContainText("Role changed · Renamed");
    await expect(
      changes.filter({ hasText: "Newly added thought." }),
    ).toContainText("Added");
    const removed = changes.filter({
      hasText: "The connection is a consequence",
    });
    await expect(removed).toContainText("Removed");
    await expect(
      removed.getByRole("button", { name: "Go to section" }),
    ).toHaveCount(0);
    await expect(
      changes.getByRole("button", { name: "Go to section" }),
    ).toHaveCount(3);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    const after = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(after.revisionCheckpoint.id).toBe(doc.revisionCheckpoint.id);
    expect(after.revisionPlan).toEqual([]);
    expect(
      after.sections.some((section: any) => section.id === middle.id),
    ).toBe(false);
  });

test("linked Next move navigates deliberately without focusing prose or reviewing memory", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await open(page);
  await page.getByRole("button", { name: "Piece memory", exact: true }).click();
  const memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(memory.getByLabel("Next-move section link")).toHaveCount(0);
  await memory
    .getByLabel("Next move")
    .fill("Tighten the reveal in the ending.");
  await memory
    .getByLabel("Next-move section link")
    .selectOption(doc.sections[2].id);
  await expect(memory.getByLabel("Next move")).toHaveValue(
    "Tighten the reveal in the ending.",
  );
  await expect(
    memory.getByRole("region", { name: "Where I left off" }),
  ).toContainText("03 · Closer");
  await memory
    .getByLabel("Next move")
    .fill("Tighten the ending after the turn.");
  await expect(memory.getByLabel("Next-move section link")).toHaveValue(
    doc.sections[2].id,
  );
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  const reviewed = (
    await (await request.get(`/api/documents/${doc.id}`)).json()
  ).pieceMemory.reviewedDraftRevision;
  await page.getByRole("button", { name: "Piece memory", exact: true }).click();
  await memory.getByRole("button", { name: "Go to section" }).click();
  const card = page.locator(`[data-section-id="${doc.sections[2].id}"]`);
  await expect(card).toHaveClass(/active/);
  await expect(card).toBeInViewport();
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(
    page.getByText("Tighten the ending after the turn."),
  ).toBeVisible();
  expect(calls).toHaveLength(0);
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.pieceMemory.nextMoveSectionId).toBe(doc.sections[2].id);
  expect(saved.pieceMemory.reviewedDraftRevision).toBe(reviewed);
  expect(saved.draftRevision).toBe(doc.draftRevision);
  expect(documentText(saved)).toBe(documentText(doc));
  await page.getByRole("button", { name: "Piece memory", exact: true }).click();
  await memory.getByLabel("Next-move section link").selectOption("");
  await expect(memory.getByLabel("Next move")).toHaveValue(
    "Tighten the ending after the turn.",
  );
  await expect(
    memory.getByRole("button", { name: "Go to section" }),
  ).toHaveCount(0);
});

for (const initialView of ["document", "workbench"] as const)
  test(`Go to section preserves ${initialView} as the saved primary view`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    doc.pieceMemory.nextMove = "Return to the closer.";
    doc.pieceMemory.nextMoveSectionId = doc.sections[2].id;
    await request.put(`/api/documents/${doc.id}`, { data: doc });
    const calls: string[] = [];
    page.on("request", (event) => {
      if (event.url().endsWith("/api/ai")) calls.push(event.url());
    });
    await open(page);
    if (initialView === "document")
      await page
        .getByRole("button", { name: "Document View", exact: true })
        .click();
    const viewButton = page.getByRole("button", {
      name: initialView === "document" ? "Document View" : "Workbench",
      exact: true,
    });
    await expect(viewButton).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/settings")).json()).layout
            ?.primaryView ?? "workbench",
      )
      .toBe(initialView);
    const reviewed = (
      await (await request.get(`/api/documents/${doc.id}`)).json()
    ).pieceMemory.reviewedDraftRevision;
    await page
      .locator(".piece-next-move")
      .getByRole("button", { name: "Go to section" })
      .click();
    await expect(viewButton).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.locator(`[data-section-id="${doc.sections[2].id}"]`),
    ).toHaveClass(/active/);
    const passage = page
      .locator(
        `[data-preview-section-id="${doc.sections[2].id}"], .dock-preview .writing-editor > section[id="${doc.sections[2].id}"]`,
      )
      .first();
    await expect(passage).toBeInViewport();
    await expect(page.getByTestId("writing-editor")).not.toBeFocused();
    await expect
      .poll(
        async () =>
          (await (await request.get("/api/settings")).json()).layout
            ?.primaryView ?? "workbench",
      )
      .toBe(initialView);
    await expect(page.getByTestId("save-state")).toHaveText("Saved");
    const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
    expect(saved.pieceMemory.reviewedDraftRevision).toBe(reviewed);
    expect(saved.pieceMemory.nextMoveSectionId).toBe(doc.sections[2].id);
    expect(documentText(saved)).toBe(documentText(doc));
    expect(calls).toHaveLength(0);
    await page.reload();
    await expect(viewButton).toHaveAttribute("aria-pressed", "true");
    expect(
      (await (await request.get("/api/settings")).json()).layout?.primaryView ??
        "workbench",
    ).toBe(initialView);
  });

test("Document View transiently reveals a linked parked section without saving pane or primary-view changes", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.sections[1].placement = "parked";
  doc.pieceMemory.nextMove = "Revisit the parked connection.";
  doc.pieceMemory.nextMoveSectionId = doc.sections[1].id;
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByRole("button", { name: "Hide Workbench" }).click();
  await expect(page.locator(".dock-workbench")).toBeHidden();
  await page
    .locator(".piece-next-move")
    .getByRole("button", { name: "Go to section" })
    .click();
  const parked = page.locator(`[data-section-id="${doc.sections[1].id}"]`);
  await expect(parked).toHaveClass(/active/);
  await expect(parked).toBeInViewport();
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(
      async () => (await (await request.get("/api/settings")).json()).layout,
    )
    .toMatchObject({ primaryView: "document", workbenchVisible: false });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dock-workbench")).toBeHidden();
});

test("duplicating a piece preserves Next move text and remaps its section link to the independent copy", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Return to the closer.";
  doc.pieceMemory.nextMoveSectionId = doc.sections[2].id;
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  const picker = page.getByLabel("Switch document");
  await expect.poll(() => picker.inputValue()).not.toBe(doc.id);
  const copy = await (
    await request.get(`/api/documents/${await picker.inputValue()}`)
  ).json();
  expect(copy.pieceMemory.nextMove).toBe(doc.pieceMemory.nextMove);
  expect(copy.pieceMemory.nextMoveSectionId).toBe(copy.sections[2].id);
  expect(copy.pieceMemory.nextMoveSectionId).not.toBe(doc.sections[2].id);
  await expect(
    page.locator(`[data-section-id="${copy.sections[0].id}"]`),
  ).toHaveClass(/active/);
  await page
    .locator(".piece-next-move")
    .getByRole("button", { name: "Go to section" })
    .click();
  await expect(
    page.locator(`[data-section-id="${copy.sections[2].id}"]`),
  ).toHaveClass(/active/);
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
});

test("linked Next move follows section reorder and current label, then safely loses its destination on deletion", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Tighten the ending.";
  doc.pieceMemory.nextMoveSectionId = doc.sections[2].id;
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  const strip = page.locator(".piece-next-move");
  await expect(strip).toContainText("03 · Closer");
  const items = page.getByTestId("structure-item");
  const height = (await items.first().boundingBox())!.height;
  await items
    .nth(2)
    .dragTo(items.nth(0), { targetPosition: { x: 20, y: height - 12 } });
  await expect(items.first()).toHaveAttribute(
    "data-section-id",
    doc.sections[2].id,
  );
  await expect(strip).toContainText("01 · Closer");
  await expect(strip).toContainText("Earlier next move:");
  await strip.getByRole("button", { name: "Go to section" }).click();
  await expect(strip).toContainText("Earlier next move:");
  await save(page);
  const afterReorder = await (
    await request.get(`/api/documents/${doc.id}`)
  ).json();
  expect(afterReorder.pieceMemory.reviewedDraftRevision).toBe(0);
  const renamed = {
    ...afterReorder,
    sections: afterReorder.sections.map((section: any) =>
      section.id === doc.sections[2].id
        ? { ...section, kind: "Point", label: "Ending" }
        : section,
    ),
  };
  await request.put(`/api/documents/${doc.id}`, { data: renamed });
  await page.reload();
  await expect(strip).toContainText("01 · Ending · Point");
  await expect(
    strip.getByRole("button", { name: "Go to section" }),
  ).toBeVisible();
  await items.first().locator(".section-options summary").click();
  await items
    .first()
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete section", exact: true })
    .click();
  await expect(strip).toContainText("Tighten the ending.");
  await expect(
    strip.getByRole("button", { name: "Go to section" }),
  ).toHaveCount(0);
  await save(page);
  const deleted = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(deleted.pieceMemory.nextMove).toBe("Tighten the ending.");
  expect(
    deleted.sections.some((section: any) => section.id === doc.sections[2].id),
  ).toBe(false);
  await page.reload();
  await expect(strip).toContainText("Tighten the ending.");
  await expect(
    strip.getByRole("button", { name: "Go to section" }),
  ).toHaveCount(0);
});

for (const width of [1440, 1024, 700])
  test(`linked memory destination is keyboard accessible without horizontal overflow at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await page
      .getByRole("button", { name: "Piece memory", exact: true })
      .click();
    const memory = page.getByRole("dialog", { name: "Piece memory" });
    await memory.getByLabel("Next move").fill("Return to the ending.");
    const link = memory.getByLabel("Next-move section link");
    await expect(link).toBeVisible();
    await link.selectOption(doc.sections[2].id);
    await expect(
      memory.getByRole("region", { name: "Where I left off" }),
    ).toContainText("03 · Closer");
    await memory.getByRole("button", { name: "Go to section" }).focus();
    await memory.getByRole("button", { name: "Go to section" }).press("Enter");
    await expect(
      page.locator(`[data-section-id="${doc.sections[2].id}"]`),
    ).toHaveClass(/active/);
    await expect(page.getByTestId("writing-editor")).not.toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  });

test("Piece memory keeps writer-authored intention, decisions and unresolved notes outside canonical prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  const memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByRole("heading", { name: "Where I left off" }),
  ).toHaveCount(0);
  await memory
    .getByRole("button", { name: "Suggest where I left off" })
    .click();
  await expect(
    memory.getByText("No explicit writer question in saved Lab runs."),
  ).toBeVisible();
  await expect(memory.getByLabel("Suggested current question")).toHaveCount(0);
  await memory
    .getByLabel("Purpose")
    .fill("Let the ending turn without explaining it.");
  await memory.getByLabel("Current question").fill("Is the middle too early?");
  await memory.getByLabel("Next move").fill("Rewrite the last beat.");
  await memory
    .getByLabel("Last session note")
    .fill("Keep the opening as it is.");
  await memory.getByLabel("Unresolved note").fill("Check the callback.");
  await memory.getByRole("button", { name: "Add unresolved" }).click();
  await memory
    .getByLabel("Decision to remember")
    .fill("Keep the triple repetition.");
  await memory.getByRole("button", { name: "Add decision" }).click();
  await expect(
    memory.getByRole("heading", { name: "Where I left off" }),
  ).toBeVisible();
  await expect(
    memory
      .getByRole("region", { name: "Where I left off" })
      .getByText("Rewrite the last beat."),
  ).toBeVisible();
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByText("Next move: Rewrite the last beat."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss next move" }).click();
  await expect(page.getByText("Next move: Rewrite the last beat.")).toHaveCount(
    0,
  );
  await save(page);
  await page.reload();
  await expect(
    page.getByText("Next move: Rewrite the last beat."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open Piece memory" }).click();
  const restored = page.getByRole("dialog", { name: "Piece memory" });
  await expect(restored.getByLabel("Purpose")).toHaveValue(
    "Let the ending turn without explaining it.",
  );
  await expect(restored.getByLabel("Last session note")).toHaveValue(
    "Keep the opening as it is.",
  );
  await expect(
    restored.getByRole("textbox", { name: "Unresolved item 1", exact: true }),
  ).toHaveValue("Check the callback.");
  await expect(
    restored.getByRole("textbox", { name: "Decision 1", exact: true }),
  ).toHaveValue("Keep the triple repetition.");
  await restored
    .getByRole("textbox", { name: "Unresolved item 1", exact: true })
    .fill("Check the callback twice.");
  await restored
    .getByRole("textbox", { name: "Decision 1", exact: true })
    .fill("Keep the final repetition.");
  await restored
    .getByRole("button", { name: "Resolve unresolved item 1" })
    .click();
  await restored.getByRole("button", { name: "Remove decision 1" }).click();
  await expect(restored.getByText("1 unresolved")).toHaveCount(0);
  await restored.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  const saved = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(saved.pieceMemory).toMatchObject({
    purpose: "Let the ending turn without explaining it.",
    unresolved: [],
    decisions: [],
    nextMove: "Rewrite the last beat.",
  });
  expect(documentText(saved)).toBe(documentText(doc));
});

test("blank Piece Memory does not warn after prose changes", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave a quieter ending.");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  const memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("Piece Memory freshness follows draft changes, review and intentional edits without rewriting prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const aiRequests: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) aiRequests.push(event.url());
  });
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  let memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await memory
    .getByLabel("Purpose")
    .fill("Let the ending land without a summary.");
  await memory.getByLabel("Next move").fill("Reread the closer.");
  await memory
    .getByLabel("Decision to remember")
    .fill("Keep the ending quiet.");
  await memory.getByRole("button", { name: "Add decision" }).click();
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByText("Next move: Reread the closer.")).toBeVisible();
  await save(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave this ending open.");
  await expect(
    page.getByText("Earlier next move: Reread the closer."),
  ).toBeVisible();
  await expect(
    page.getByText("Draft changed since this was saved."),
  ).toBeVisible();
  await save(page);
  await page.reload();
  await expect(
    page.getByText("Earlier next move: Reread the closer."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review Piece memory" }).click();
  memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toBeVisible();
  await expect(
    memory.getByRole("textbox", { name: "Decision 1", exact: true }),
  ).toHaveValue("Keep the ending quiet.");
  const prose = documentText(
    await (await request.get(`/api/documents/${doc.id}`)).json(),
  );
  await memory.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await expect(memory.getByLabel("Purpose")).toHaveValue(
    "Let the ending land without a summary.",
  );
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByText("Next move: Reread the closer.")).toBeVisible();
  await save(page);
  expect(
    documentText(await (await request.get(`/api/documents/${doc.id}`)).json()),
  ).toBe(prose);
  await select(page, "Leave this ending open.");
  await page.keyboard.insertText("Leave this ending unresolved.");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toBeVisible();
  await memory
    .getByLabel("Last session note")
    .fill("Do not touch the opening.");
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  expect(aiRequests).toHaveLength(0);
  expect(
    (await (await request.get(`/api/documents/${doc.id}`)).json()).pieceMemory
      .reviewedDraftRevision,
  ).toBe(2);
});

test("activating a different saved take changes the draft without judging a memory decision", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.nextMove = "Compare the closer takes.";
  doc.pieceMemory.decisions.push({
    id: "decision",
    text: "Keep the quiet ending.",
    createdAt: doc.createdAt,
  });
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Quiet");
  await page.getByLabel("Take name (optional)").press("Enter");
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("Leave this ending louder!");
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  const memory = page.getByRole("dialog", { name: "Piece memory" });
  await memory.getByRole("button", { name: "Mark reviewed" }).click();
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByText("Next move: Compare the closer takes."),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 take" }).click();
  await page
    .locator(".variants .variant")
    .getByRole("button", { name: "Activate" })
    .click();
  await expect(
    page.getByText("Earlier next move: Compare the closer takes."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review Piece memory" }).click();
  await expect(
    memory.getByRole("textbox", { name: "Decision 1", exact: true }),
  ).toHaveValue("Keep the quiet ending.");
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toBeVisible();
});

test("metadata and Lab work do not stale memory, while blank Next move keeps freshness inside the panel", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.pieceMemory.purpose = "Leave the reader with the quiet line.";
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await diagnose(page, "shorten");
  await save(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  let memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await select(page, "Leave this ending alone.");
  await page.keyboard.insertText("The ending now asks more.");
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  memory = page.getByRole("dialog", { name: "Piece memory" });
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toBeVisible();
  await expect(memory.getByLabel("Purpose")).toHaveValue(
    "Leave the reader with the quiet line.",
  );
});

test("session question suggestion stays tentative and unsaved until individually accepted", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const prose = documentText(doc);
  const target = targetFor(doc, doc.sections[0].id);
  doc.sections[0].workbench = emptyWorkbench();
  doc.sections[0].workbench.runs.push({
    id: "old-question",
    createdAt: doc.createdAt,
    target,
    action: "coach",
    instruction: "Does this opening arrive too early?",
    answer: "",
    controls: {},
    model: null,
    response: {
      provider: "mock",
      diagnosis: "Earlier analysis.",
      mechanism: "",
      question: "A model-generated question must not become memory.",
      missingIngredients: [],
      findings: [],
      proposals: [],
      lexical: [],
    },
  });
  doc.sections[0].content = paragraphs("The opening has since changed.");
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  const aiRequests: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) aiRequests.push(event.url());
  });
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  const memory = page.getByRole("dialog", { name: "Piece memory" });
  await memory
    .getByRole("button", { name: "Suggest where I left off" })
    .click();
  await expect(
    memory.getByText("Earlier writer-authored Lab question"),
  ).toBeVisible();
  await expect(memory.getByLabel("Suggested current question")).toHaveValue(
    "Does this opening arrive too early?",
  );
  await expect(
    memory.getByLabel("Current question", { exact: true }),
  ).toHaveValue("");
  await memory.getByRole("button", { name: "Ignore suggestion" }).click();
  await expect(
    memory.getByLabel("Current question", { exact: true }),
  ).toHaveValue("");
  await expect(
    memory.getByText("Draft changed since this memory was last updated."),
  ).toHaveCount(0);
  await memory
    .getByRole("button", { name: "Suggest where I left off" })
    .click();
  await memory
    .getByLabel("Suggested current question")
    .fill("Does the new opening arrive too early?");
  await memory.getByRole("button", { name: "Keep this question" }).click();
  await expect(
    memory.getByLabel("Current question", { exact: true }),
  ).toHaveValue("Does the new opening arrive too early?");
  await memory.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  expect(aiRequests).toHaveLength(0);
  const stored = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(stored.pieceMemory.currentQuestion).toBe(
    "Does the new opening arrive too early?",
  );
  expect(stored.pieceMemory.reviewedDraftRevision).toBe(stored.draftRevision);
  expect(documentText(stored)).toBe(
    prose.replace(
      "First sentence stays. I really utilize tools in order to help. Last sentence stays.",
      "The opening has since changed.",
    ),
  );
});

test("Piece memory stays document-local and survives single/bulk export, duplicate and archive restore", async ({
  page,
  request,
}) => {
  const first = await seed(request);
  first.pieceMemory.nextMove = "Reread the bridge.";
  first.pieceMemory.nextMoveSectionId = first.sections[1].id;
  first.revisionCheckpoint = makeRevisionCheckpoint(
    first,
    first.draftRevision,
    "Before export",
  );
  first.revisionPlan = [
    {
      id: "pass-note",
      sectionId: first.sections[1].id,
      text: "Revisit the bridge.",
      createdAt: first.createdAt,
      completedAt: first.createdAt,
    },
  ];
  first.pieceMemory.decisions.push({
    id: "choice",
    text: "Keep the closer.",
    createdAt: first.createdAt,
  });
  await request.put(`/api/documents/${first.id}`, { data: first });
  const second = await (
    await request.post("/api/import", {
      data: { document: newDocument("Other draft", "Unrelated prose.") },
    })
  ).json();
  await open(page);
  const switcher = page.getByLabel("Switch document");
  await switcher.selectOption(first.id);
  await expect(page.getByText("Next move: Reread the bridge.")).toBeVisible();
  await page.getByRole("button", { name: "Document actions" }).click();
  const singleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const single = JSON.parse(
    readFileSync((await (await singleDownload).path())!, "utf8"),
  );
  expect(single.pieceMemory.nextMove).toBe("Reread the bridge.");
  expect(single.pieceMemory.nextMoveSectionId).toBe(first.sections[1].id);
  expect(single.revisionCheckpoint.sections[1].id).toBe(first.sections[1].id);
  expect(single.revisionCheckpoint.label).toBe("Before export");
  expect(single.revisionPlan[0]).toMatchObject({
    sectionId: first.sections[1].id,
    text: "Revisit the bridge.",
    completedAt: first.createdAt,
  });
  expect(single.pieceMemory.reviewedDraftRevision).toBe(single.draftRevision);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  let manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage
    .locator(`[data-managed-id="${first.id}"] input[type="checkbox"]`)
    .check();
  const selectedDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export selected" }).click();
  const selected = JSON.parse(
    readFileSync((await (await selectedDownload).path())!, "utf8"),
  );
  expect(selected.documents.map((item: any) => item.id)).toEqual([first.id]);
  expect(selected.documents[0].pieceMemory.decisions[0].text).toBe(
    "Keep the closer.",
  );
  expect(selected.documents[0].pieceMemory.nextMoveSectionId).toBe(
    first.sections[1].id,
  );
  expect(selected.documents[0].revisionCheckpoint.sections[1].id).toBe(
    first.sections[1].id,
  );
  expect(selected.documents[0].revisionPlan[0].sectionId).toBe(
    first.sections[1].id,
  );
  expect(selected.documents[0].pieceMemory.reviewedDraftRevision).toBe(
    selected.documents[0].draftRevision,
  );
  const allDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export all" }).click();
  const all = JSON.parse(
    readFileSync((await (await allDownload).path())!, "utf8"),
  );
  expect(
    all.documents.find((item: any) => item.id === first.id).pieceMemory
      .nextMove,
  ).toBe("Reread the bridge.");
  expect(
    all.documents.find((item: any) => item.id === first.id).pieceMemory
      .nextMoveSectionId,
  ).toBe(first.sections[1].id);
  expect(
    all.documents.find((item: any) => item.id === second.id).pieceMemory
      .nextMove,
  ).toBe("");
  await manage.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect.poll(() => switcher.inputValue()).not.toBe(first.id);
  const duplicateId = await switcher.inputValue();
  const duplicate = await (
    await request.get(`/api/documents/${duplicateId}`)
  ).json();
  expect(duplicate.pieceMemory.nextMove).toBe("Reread the bridge.");
  expect(duplicate.pieceMemory.nextMoveSectionId).toBe(
    duplicate.sections[1].id,
  );
  expect(duplicate.revisionCheckpoint.sections[1].id).toBe(
    duplicate.sections[1].id,
  );
  expect(duplicate.revisionCheckpoint.sections[1].id).not.toBe(
    first.sections[1].id,
  );
  expect(duplicate.revisionPlan[0].sectionId).toBe(duplicate.sections[1].id);
  expect(duplicate.revisionPlan[0].completedAt).toBe(first.createdAt);
  expect(duplicate.pieceMemory.reviewedDraftRevision).toBe(
    duplicate.draftRevision,
  );
  expect(duplicate.pieceMemory.decisions[0].id).not.toBe("choice");
  await switcher.selectOption(second.id);
  await expect(page.getByText("Next move: Reread the bridge.")).toHaveCount(0);
  await switcher.selectOption(first.id);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Archive document" }).click();
  await page
    .getByRole("dialog", { name: /Archive/ })
    .getByRole("button", { name: "Archive document" })
    .click();
  await page.reload();
  await expect(switcher).not.toHaveValue(first.id);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage
    .locator(`[data-managed-id="${first.id}"]`)
    .getByRole("button", { name: /Restore/ })
    .click();
  await manage.getByRole("button", { name: "Close dialog" }).click();
  await switcher.selectOption(first.id);
  await expect(page.getByText("Next move: Reread the bridge.")).toBeVisible();
  const restored = await (
    await request.get(`/api/documents/${first.id}`)
  ).json();
  expect(restored.pieceMemory.nextMoveSectionId).toBe(first.sections[1].id);
  expect(restored.revisionCheckpoint).toEqual(single.revisionCheckpoint);
  expect(restored.revisionPlan).toEqual(single.revisionPlan);
});

test("archiving an active document preserves its work and restores it without changing the current draft", async ({
  page,
  request,
}) => {
  const first = await seed(request);
  const second = await (
    await request.post("/api/import", {
      data: { document: newDocument("Still writing", "An active draft.") },
    })
  ).json();
  await open(page);
  const picker = page.getByLabel("Switch document");
  await picker.selectOption(first.id);
  await page.getByRole("button", { name: /^03 Closer$/ }).click();
  await page.getByRole("button", { name: "Save take", exact: true }).click();
  await page.getByLabel("Take name (optional)").fill("Early closer");
  await page.getByLabel("Take name (optional)").press("Enter");
  await save(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Archive document" }).click();
  const confirm = page.getByRole("dialog", { name: /Archive/ });
  await expect(confirm).toContainText(first.title);
  await expect(
    confirm.getByRole("button", { name: "Keep writing" }),
  ).toBeFocused();
  await confirm.getByRole("button", { name: "Archive document" }).click();
  await expect(picker).toHaveValue(second.id);
  await expect(picker.locator(`option[value="${first.id}"]`)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    `Archived “${first.title}”`,
  );
  await page.reload();
  await expect(picker).toHaveValue(second.id);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await expect(
    manage.getByRole("heading", { name: "Active · 1" }),
  ).toBeVisible();
  await expect(
    manage.getByRole("heading", { name: "Archived · 1" }),
  ).toBeVisible();
  const row = manage
    .locator(".managed-document")
    .filter({ hasText: first.title });
  await row.getByRole("button", { name: "Restore" }).click();
  await expect(
    manage.getByRole("heading", { name: "Archived · 0" }),
  ).toBeVisible();
  await expect(row.getByRole("button", { name: /Archive/ })).toBeFocused();
  await expect(manage.getByRole("status")).toContainText(
    `Restored “${first.title}”`,
  );
  await manage.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Document actions" }),
  ).toBeFocused();
  await expect(picker).toHaveValue(second.id);
  await picker.selectOption(first.id);
  const restored = await (
    await request.get(`/api/documents/${first.id}`)
  ).json();
  expect(restored.sections[2].variants[0]).toMatchObject({
    label: "Early closer",
    origin: "human",
  });
  expect(restored.sources[0].text).toBe(first.sources[0].text);
});

test("archiving the last active document makes a blank replacement without reopening the archive", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Archive document" }).click();
  await page
    .getByRole("dialog", { name: /Archive/ })
    .getByRole("button", { name: "Archive document" })
    .click();
  const picker = page.getByLabel("Switch document");
  await expect(picker).not.toHaveValue(doc.id);
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled");
  await page.reload();
  await expect(picker).not.toHaveValue(doc.id);
  await expect(picker.locator("option")).toHaveCount(1);
  expect(
    (await (await request.get("/api/documents/archived")).json())[0].id,
  ).toBe(doc.id);
});

test("archived document permanent removal has a named safe confirmation", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Archive document" }).click();
  await page
    .getByRole("dialog", { name: /Archive/ })
    .getByRole("button", { name: "Archive document" })
    .click();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage
    .locator(".managed-document")
    .filter({ hasText: doc.title })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  const confirmation = manage.getByRole("alertdialog", {
    name: "Confirm permanent delete",
  });
  await expect(confirmation).toContainText(doc.title);
  await expect(confirmation).toContainText(
    "saved takes, history and references",
  );
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(
    manage.getByRole("heading", { name: "Archived · 1" }),
  ).toBeVisible();
  await manage
    .locator(".managed-document")
    .filter({ hasText: doc.title })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await confirmation
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(
    manage.getByRole("heading", { name: "Archived · 0" }),
  ).toBeVisible();
  await expect(
    manage
      .locator(".managed-document")
      .first()
      .getByRole("button", { name: /Archive/ }),
  ).toBeFocused();
  expect((await request.get(`/api/documents/${doc.id}`)).status()).toBe(404);
});

test("bulk archive of every active document creates a blank survivor and bulk restore keeps it selected", async ({
  page,
  request,
}) => {
  const a = await seed(request);
  const b = await (
    await request.post("/api/import", {
      data: {
        document: newDocument("Another active piece", "One more draft."),
      },
    })
  ).json();
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await expect(manage.getByText("2 selected")).toBeVisible();
  await manage.getByRole("button", { name: /Archive 2 active/ }).click();
  await manage
    .getByRole("alertdialog", { name: "Confirm archive" })
    .getByRole("button", { name: "Archive selected" })
    .click();
  await expect(
    manage.getByRole("heading", { name: "Active · 1" }),
  ).toBeVisible();
  await expect(
    manage.getByRole("heading", { name: "Archived · 2" }),
  ).toBeVisible();
  const blankId = await page.getByLabel("Switch document").inputValue();
  expect(blankId).not.toBe(a.id);
  expect(blankId).not.toBe(b.id);
  await page.reload();
  await expect(page.getByLabel("Switch document")).toHaveValue(blankId);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const reopened = page.getByRole("dialog", { name: "Manage documents" });
  await reopened.getByRole("button", { name: "Select all visible" }).click();
  await reopened.getByRole("button", { name: /Restore 2 archived/ }).click();
  await expect(
    reopened.getByRole("heading", { name: "Active · 3" }),
  ).toBeVisible();
  await expect(page.getByLabel("Switch document")).toHaveValue(blankId);
});

test("archiving the last active document keeps its blank replacement through permanent archived deletion", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await manage.getByRole("button", { name: /Archive 1 active/ }).click();
  await manage
    .getByRole("alertdialog", { name: "Confirm archive" })
    .getByRole("button", { name: /Archive/ })
    .click();
  await expect(
    manage.getByRole("heading", { name: "Archived · 1" }),
  ).toBeVisible();
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await manage.getByRole("button", { name: /Delete 1 archived/ }).click();
  const confirmation = manage.getByRole("alertdialog", {
    name: "Confirm permanent delete",
  });
  await expect(
    confirmation.getByRole("button", { name: "Cancel" }),
  ).toBeFocused();
  await confirmation
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(
    manage.getByRole("heading", { name: "Active · 1" }),
  ).toBeVisible();
  await manage.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled");
  await expect(page.getByTestId("writing-editor")).toHaveText("");
  await page.reload();
  await expect(page.getByLabel("Switch document")).not.toHaveValue(doc.id);
});

test("document menu and Manage dialog preserve keyboard focus through Escape", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  const trigger = page.getByRole("button", { name: "Document actions" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(
    page.getByRole("button", { name: "AI providers", exact: true }),
  ).toBeFocused();
  for (let index = 0; index < 5; index++)
    await page.keyboard.press("ArrowDown");
  const manage = page.getByRole("button", { name: "Manage documents" });
  await expect(manage).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Manage documents" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(
    page.getByRole("button", { name: "AI providers", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("Manage rows stay grouped at 1024px and archived destructive actions are separated", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await request.post("/api/documents/archive", { data: { ids: [doc.id] } });
  await page.setViewportSize({ width: 1024, height: 768 });
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  const archived = manage
    .locator(".managed-document")
    .filter({ hasText: doc.title });
  await expect(archived).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(1025);
  expect(
    await archived
      .locator(".managed-danger")
      .evaluate((node) => getComputedStyle(node).borderLeftWidth),
  ).toBe("1px");
  const bounds = (await archived.boundingBox())!;
  const controls = (await archived.locator(".row").boundingBox())!;
  expect(controls.x + controls.width).toBeLessThanOrEqual(
    bounds.x + bounds.width + 1,
  );
});

test("Manage documents keeps filtered selections visible in the summary and only deletes archived IDs", async ({
  page,
  request,
}) => {
  const first = await seed(request);
  const second = await (
    await request.post("/api/import", {
      data: { document: newDocument("Other title", "Second document.") },
    })
  ).json();
  const third = await (
    await request.post("/api/import", {
      data: { document: newDocument("Third title", "Third document.") },
    })
  ).json();
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await manage.getByLabel("Search document titles").fill("Other title");
  await expect(
    manage.getByText("3 selected · 2 hidden by filter"),
  ).toBeVisible();
  await expect(
    manage.getByRole("button", { name: /Archive 3 active/ }),
  ).toBeVisible();
  await expect(
    manage.getByRole("button", { name: /Delete.*archived/ }),
  ).toBeDisabled();
  await manage.getByRole("button", { name: "Clear hidden selections" }).click();
  await expect(manage.getByText("1 selected")).toBeVisible();
  await manage.getByRole("button", { name: "Clear selection" }).click();
  await expect(manage.getByText("0 selected")).toBeVisible();
  await manage.getByLabel("Search document titles").fill("");
  await manage
    .locator(`[data-managed-id="${first.id}"]`)
    .getByRole("button", { name: /Archive/ })
    .click();
  await manage
    .getByRole("alertdialog", { name: "Confirm archive" })
    .getByRole("button", { name: /Archive/ })
    .click();
  await manage
    .locator(`[data-managed-id="${first.id}"]`)
    .getByRole("checkbox")
    .check();
  await manage
    .locator(`[data-managed-id="${second.id}"]`)
    .getByRole("checkbox")
    .check();
  await expect(manage.getByText("2 selected")).toBeVisible();
  await expect(
    manage.getByRole("button", { name: /Archive 1 active/ }),
  ).toBeVisible();
  await expect(
    manage.getByRole("button", { name: /Restore 1 archived/ }),
  ).toBeVisible();
  await expect(
    manage.getByRole("button", { name: /Delete 1 archived/ }),
  ).toBeVisible();
  await manage.getByRole("button", { name: /Delete 1 archived/ }).click();
  await manage
    .getByRole("alertdialog", { name: "Confirm permanent delete" })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(manage.getByText("1 selected")).toBeVisible();
  expect(
    (await (await request.get("/api/documents")).json()).map(
      (doc: any) => doc.id,
    ),
  ).toEqual(expect.arrayContaining([second.id, third.id]));
  expect((await request.get(`/api/documents/${first.id}`)).status()).toBe(404);
});

test("blocked bulk download reports an error rather than claiming export", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  await page.evaluate(() => {
    HTMLAnchorElement.prototype.click = () => {
      throw new Error("Blocked download");
    };
  });
  await manage.getByRole("button", { name: "Export all" }).click();
  await expect(manage.getByRole("alert")).toContainText("Blocked download");
  await expect(manage.getByRole("status")).toHaveCount(0);
});

test("Manage documents selects by ID, exports one backup and requires DELETE for bulk permanent removal", async ({
  page,
  request,
}) => {
  const first = await seed(request);
  const second = await (
    await request.post("/api/import", {
      data: {
        document: newDocument(first.title, "Another copy of the title."),
      },
    })
  ).json();
  const remaining = await (
    await request.post("/api/import", {
      data: { document: newDocument("Keep me", "Writing that remains.") },
    })
  ).json();
  await open(page);
  const duplicateOptions = await page
    .getByLabel("Switch document")
    .locator("option")
    .allTextContents();
  expect(
    duplicateOptions.filter((text) => text.includes(first.title)),
  ).toHaveLength(2);
  expect(
    new Set(duplicateOptions.filter((text) => text.includes(first.title))).size,
  ).toBe(2);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Manage documents" }).click();
  const manage = page.getByRole("dialog", { name: "Manage documents" });
  const sameTitleRows = manage
    .locator(".managed-document")
    .filter({ hasText: first.title });
  await expect(sameTitleRows).toHaveCount(2);
  await expect(sameTitleRows.nth(0).locator(".document-cue")).not.toHaveText(
    await sameTitleRows.nth(1).locator(".document-cue").innerText(),
  );
  const firstRowArchive = sameTitleRows
    .nth(0)
    .getByRole("button", { name: /Archive .*A place for my words/ });
  await expect(firstRowArchive).toBeVisible();
  const cue = await sameTitleRows.nth(0).locator(".document-cue").innerText();
  await firstRowArchive.click();
  const duplicateConfirmation = manage.getByRole("alertdialog", {
    name: "Confirm archive",
  });
  await expect(duplicateConfirmation).toContainText(cue);
  await duplicateConfirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(firstRowArchive).toBeFocused();
  await expect(
    manage.getByRole("heading", { name: "Active · 3" }),
  ).toBeVisible();
  await expect(
    manage.getByRole("heading", { name: "Archived · 0" }),
  ).toBeVisible();
  await manage.getByLabel("Search document titles").fill(first.title);
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await expect(manage.getByText("2 selected")).toBeVisible();
  const selectedDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export selected" }).click();
  const selectedFile = await selectedDownload;
  expect(selectedFile.suggestedFilename()).toMatch(
    /language-workbench-selected-.*\.json/,
  );
  await expect(manage.getByRole("status")).toContainText(
    "Exported 2 documents",
  );
  const selectedBackup = JSON.parse(
    readFileSync(await selectedFile.path()!, "utf8"),
  );
  expect(selectedBackup).toMatchObject({
    format: "language-workbench-document-backup",
    version: 1,
  });
  expect(new Set(selectedBackup.documents.map((doc: any) => doc.id))).toEqual(
    new Set([first.id, second.id]),
  );
  expect(JSON.stringify(selectedBackup)).not.toMatch(
    /OPENAI_API_KEY|apiKey|credentialSuffix/,
  );
  const allDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export all" }).click();
  const allFile = await allDownload;
  expect(allFile.suggestedFilename()).toMatch(
    /language-workbench-all-.*\.json/,
  );
  expect(allFile.suggestedFilename()).not.toBe(
    selectedFile.suggestedFilename(),
  );
  const allBackup = JSON.parse(readFileSync(await allFile.path()!, "utf8"));
  const repeatedDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export all" }).click();
  expect((await repeatedDownload).suggestedFilename()).not.toBe(
    allFile.suggestedFilename(),
  );
  expect(new Set(allBackup.documents.map((doc: any) => doc.id))).toEqual(
    new Set([first.id, second.id, remaining.id]),
  );
  await manage.getByRole("button", { name: /Archive 2 active/ }).click();
  const archive = manage.getByRole("alertdialog", { name: "Confirm archive" });
  await expect(archive).toContainText("Archive 2 documents?");
  await archive.getByRole("button", { name: "Archive selected" }).click();
  await expect(
    manage.getByRole("heading", { name: "Active · 1" }),
  ).toBeVisible();
  await expect(
    manage.getByRole("heading", { name: "Archived · 2" }),
  ).toBeVisible();
  const archivedDownload = page.waitForEvent("download");
  await manage.getByRole("button", { name: "Export all" }).click();
  const archivedBackup = JSON.parse(
    readFileSync(await (await archivedDownload).path()!, "utf8"),
  );
  expect(new Set(archivedBackup.archivedIds)).toEqual(
    new Set([first.id, second.id]),
  );
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await expect(manage.getByText("2 selected")).toBeVisible();
  await manage.getByRole("button", { name: /Restore 2 archived/ }).click();
  await expect(
    manage.getByRole("heading", { name: "Active · 3" }),
  ).toBeVisible();
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await manage.getByRole("button", { name: /Archive 2 active/ }).click();
  await manage
    .getByRole("alertdialog", { name: "Confirm archive" })
    .getByRole("button", { name: /Archive/ })
    .click();
  await manage.getByRole("button", { name: "Select all visible" }).click();
  await manage.getByRole("button", { name: /Delete 2 archived/ }).click();
  const deletion = manage.getByRole("alertdialog", {
    name: "Confirm permanent delete",
  });
  await expect(deletion).toContainText("permanently deletes");
  await expect(deletion.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(
    deletion.getByRole("button", { name: "Delete permanently" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(deletion).toHaveCount(0);
  await manage.getByRole("button", { name: /Delete 2 archived/ }).click();
  await deletion.getByLabel("Type DELETE to confirm").fill("DELETE ");
  await deletion.getByLabel("Type DELETE to confirm").press("Enter");
  await expect(deletion).toBeVisible();
  await deletion.getByLabel("Type DELETE to confirm").fill("DELETE");
  await deletion.getByLabel("Type DELETE to confirm").press("Enter");
  await expect(deletion).toHaveCount(0);
  await expect(
    manage.getByRole("heading", { name: "Active · 1" }),
  ).toBeVisible();
  expect(
    (await (await request.get("/api/documents")).json()).map(
      (doc: any) => doc.id,
    ),
  ).toEqual([remaining.id]);
});

test("document deletion names the document, starts on Cancel, and explains blank replacement", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  const trigger = page.getByRole("button", {
    name: "Delete document",
    exact: true,
  });
  await expect(trigger).toHaveAttribute("title", "Delete document");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: /Delete/ });
  await expect(dialog).toContainText(doc.title);
  await expect(dialog).toContainText("A new blank document will be created");
  await expect(
    dialog.getByRole("button", { name: "Keep writing" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Document actions" }).click();
  await trigger.click();
  await dialog.getByRole("button", { name: "Delete document" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Deleted “${doc.title}”`,
  );
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled");
  await expect(page.getByTestId("writing-editor")).toHaveText("");
});

test("new, duplicate, import/export and delete confirmation work", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  const menu = () =>
    page.getByRole("button", { name: "Document actions" }).click();
  await menu();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "A place for my words — copy",
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "First sentence",
  );
  await page.getByLabel("Document title").fill("My renamed draft");
  await save(page);
  await menu();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  await page.locator("input[type=file]").setInputFiles(path!);
  await expect
    .poll(async () =>
      page.getByLabel("Switch document").locator("option").count(),
    )
    .toBe(3);
  await menu();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep writing" }).click();
  expect(
    await page.getByLabel("Switch document").locator("option").count(),
  ).toBe(3);
  await menu();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await expect(
    page.getByLabel("Switch document").locator("option"),
  ).toHaveCount(2);
  await menu();
  await page.getByRole("button", { name: "New document", exact: true }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled");
  await expect(page.getByTestId("writing-editor")).toHaveText("");
});
test("large rapid insertions and composition events preserve editable text", async ({
  page,
  request,
}) => {
  await seed(request, "");
  await open(page);
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+Home");
  await editor.dispatchEvent("compositionstart", { data: "" });
  await editor.dispatchEvent("compositionend", { data: "Dictated thought." });
  await page.keyboard.insertText(
    "Dictated thought. " + "A longer breath, then a fragment. ".repeat(250),
  );
  await save(page);
  await page.reload();
  await expect(editor).toContainText("Dictated thought.");
  const text = await editor.innerText();
  expect(text.match(/A longer breath/g)?.length).toBe(250);
});

test("section copy and whole-document copy are exact; cross-section AI is disabled", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "01 Opening" }).click();
  await page.getByRole("button", { name: "Copy target", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(documentText({ ...doc, sections: [doc.sections[0]] }));
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("button", { name: "Copy plain text", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(documentText(doc));
  await page.getByTestId("writing-editor").click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect(page.getByRole("button", { name: /Diagnose this/ })).toHaveCount(
    0,
  );
});
test("Diagnose rebases an external focus-only revision without changing prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "01 Opening" }).click();
  await page
    .getByLabel("Writing action", { exact: true })
    .selectOption("shorten");
  await save(page);
  const before = await (await request.get(`/api/documents/${doc.id}`)).json();
  const outside = await request.put(`/api/documents/${doc.id}`, {
    data: { ...before, focusTarget: targetFor(before, before.sections[1].id) },
  });
  expect(outside.ok()).toBe(true);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText("OFFLINE");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const after = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(after.sections.map((s: { content: unknown }) => s.content)).toEqual(
    before.sections.map((s: { content: unknown }) => s.content),
  );
  expect(after.sections[0].workbench.runs).toHaveLength(1);
  expect(after.revision).toBeGreaterThan(before.revision + 1);
});

test("Diagnose preserves a genuine concurrent prose conflict", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "01 Opening" }).click();
  await page
    .getByLabel("Writing action", { exact: true })
    .selectOption("shorten");
  await save(page);
  const before = await (await request.get(`/api/documents/${doc.id}`)).json();
  const external = await request.put(`/api/documents/${doc.id}`, {
    data: {
      ...before,
      sections: before.sections.map((section: { id: string }) =>
        section.id === before.sections[0].id
          ? { ...section, content: paragraphs("External writer changed this.") }
          : section,
      ),
    },
  });
  expect(external.ok()).toBe(true);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.getByTestId("save-state")).toHaveText("Not saved");
  await expect(page.getByRole("alert")).toContainText(
    "Document changed. Reload before saving.",
  );
  const after = await (await request.get(`/api/documents/${doc.id}`)).json();
  expect(documentText(after)).toContain("External writer changed this.");
  expect(after.sections[0].workbench?.runs ?? []).toHaveLength(0);
});

test("typing during a delayed save is retained and navigation waits for saving", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  const second = await (
    await request.post("/api/documents", {
      data: { title: "Another draft", text: "Independent writing." },
    })
  ).json();
  await open(page);
  await page.getByLabel("Switch document").selectOption(doc.id);
  await expect(page.getByTestId("writing-editor")).toContainText(
    "First sentence",
  );
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    seen = new Promise<void>((r) => (arrived = r));
  let first = true;
  await page.route("**/api/documents/" + doc.id, async (route) => {
    if (route.request().method() === "PUT" && first) {
      first = false;
      arrived();
      await gate;
    }
    await route.continue();
  });
  await select(page, "First sentence stays.", true);
  await page.keyboard.type("One. ");
  await page.getByTestId("save-state").click();
  await seen;
  await page.keyboard.insertText("Two. ");
  await page.getByLabel("Switch document").selectOption(second.id);
  await expect(page.getByLabel("Document title")).toHaveValue(doc.title);
  release();
  await expect(page.getByLabel("Document title")).toHaveValue("Another draft");
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(documentText(stored)).toContain("One. Two. First sentence stays.");
});
test("empty bootstrap persists stable IDs and text typed before backend startup finishes", async ({
  page,
  request,
}) => {
  const docs = await (await request.get("/api/documents")).json();
  for (const doc of docs)
    await request.delete("/api/documents/" + doc.id, {
      headers: { "Content-Type": "application/json" },
    });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/api/documents", async (route) => {
    if (route.request().method() === "GET") await gate;
    await route.continue();
  });
  await page.goto("/");
  await page.getByTestId("writing-editor").click();
  await page.keyboard.insertText("Before the server replies.");
  release();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const id = await page
    .getByTestId("structure-item")
    .getAttribute("data-section-id");
  await page.reload();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Before the server replies.",
  );
  await expect(page.getByTestId("structure-item")).toHaveAttribute(
    "data-section-id",
    id!,
  );
  expect((await (await request.get("/api/documents")).json()).length).toBe(1);
});
test("saved variants and section notes survive reorder, deletion undo, and reload", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "01 Opening" }).click();
  await diagnose(page);
  await page
    .getByLabel("Your material", { exact: true })
    .fill("Keep the point.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("save-variant").first().click();
  await page.locator(".section-options summary").click();
  await page
    .getByLabel("Section notes · AI context")
    .fill("Keep this metadata.");
  await page
    .getByRole("button", { name: "Remove section", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete section", exact: true })
    .click();
  await expect(page.getByTestId("structure-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sections[0].notes).toBe("Keep this metadata.");
  expect(stored.sections[0].variants).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "01 Opening" }).click();
  await page.locator(".variants summary").click();
  await page.getByRole("button", { name: "Copy take", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(stored.sections[0].variants[0].text);
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I utilize tools to help.",
  );
});
test("paragraph and list paste keep readable context and exact local targets", async ({
  page,
  request,
}) => {
  await seed(request, "");
  await open(page);
  await page.getByTestId("writing-editor").click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.evaluate(() =>
    navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(
          ["<ul><li>One item.</li><li>I really utilize tools.</li></ul>"],
          { type: "text/html" },
        ),
      }),
    ]),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("writing-editor").locator("li")).toHaveCount(2);
  await select(page, "I really utilize tools.");
  await diagnose(page);
  await page
    .getByLabel("Your material", { exact: true })
    .fill("Trim the filler.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("accept-proposal").first().click();
  await expect(page.getByTestId("writing-editor")).toContainText("One item.");
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I utilize tools.",
  );
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("button", { name: "Copy plain text", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "- One item.\n- I utilize tools.",
  );
});
test("repeat model calls create independent iteration records and unchanged anchors survive autosave", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "I really utilize tools in order to help.");
  await diagnose(page);
  await page.getByLabel("Your material", { exact: true }).fill("Trim.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("reject-proposal").first().click();
  await save(page);
  await page.getByRole("button", { name: "Propose options" }).click();
  await page.getByTestId("save-variant").first().click();
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.history).toHaveLength(2);
  expect(stored.history[0].id).not.toBe(stored.history[1].id);
  expect(stored.history.map((h: any) => h.state)).toEqual([
    "rejected",
    "saved",
  ]);
});

test("desktop layout, progressive controls and highlight match the Inspector at 1280px", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const highlighted = await page.locator(".target-highlight").allTextContents();
  const target = await page.locator(".target-box p").innerText();
  expect(highlighted.join("")).toBe(target);
  await expect(
    page.locator(".control-details input").first(),
  ).not.toBeVisible();
  await expect(page.getByTestId("writing-editor")).toHaveCSS(
    "font-size",
    "22px",
  );
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Document actions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy plain text", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Document actions", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/verified-desktop-1280.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Radar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Refresh live research" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("No fake trends");
});
