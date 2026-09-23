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
  documentText,
} from "../../packages/domain/src/index";
async function seed(
  request: APIRequestContext,
  text = "First sentence stays. I really utilize tools in order to help. Last sentence stays.",
) {
  const existing = await (await request.get("/api/documents")).json();
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
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Hello. ");
  await expect(editor).toContainText("Hello. First sentence stays.");
  await page.keyboard.press("Control+z");
  await expect(editor).not.toContainText("Hello.");
  await page.keyboard.press("Control+Shift+z");
  await expect(editor).toContainText("Hello.");
  await select(page, "Hello.");
  await page.keyboard.press("Control+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Hello.");
  await page.keyboard.press("Control+x");
  await expect(editor).not.toContainText("Hello.");
  await page.keyboard.press("Control+v");
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
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+v");
  await expect(editor.locator("strong")).toHaveText("External bold");
  await page.keyboard.type(" Still editable.");
  await expect(editor).toContainText("Still editable.");
  await save(page);
  await page.reload();
  await expect(editor).toContainText("External bold");
  await editor.click();
  await page.keyboard.press("Control+a");
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
  await expect(page.getByLabel("Variant text")).toHaveValue(/I really utilize/);
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
  expect(stored.history[0].state).toBe("accepted");
  await page.reload();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "I really utilize",
  );
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
  expect(
    (await (await request.get("/api/documents/" + doc.id)).json()).sections,
  ).toEqual(doc.sections);
});
test("drag/reorder preserves metadata and save survives reload; split and merge work", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const items = page.getByTestId("structure-item");
  await items.nth(2).dragTo(items.nth(0));
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
  await page.keyboard.press("Control+Home");
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
  await page.keyboard.press("Control+Home");
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
  await page.keyboard.press("Control+a");
  await expect(page.getByRole("button", { name: /Diagnose this/ })).toHaveCount(
    0,
  );
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
  await page.getByRole("button", { name: "Copy variant", exact: true }).click();
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
  await page.keyboard.press("Control+Home");
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
  await page.keyboard.press("Control+v");
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
    "One item.\nI utilize tools.",
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
