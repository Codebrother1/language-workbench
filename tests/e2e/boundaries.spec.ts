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
  type Document,
} from "../../packages/domain/src/index";

const firstSentence = "Assumed tools in order to help.";
const firstParagraph = firstSentence + " A second sentence stays.";
async function seed(request: APIRequestContext) {
  for (const doc of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + doc.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("Six independent sections");
  doc.sections = ["Hook", "Point", "Segue", "Reveal", "Callback", "Closer"].map(
    (kind, i) =>
      newSection(
        kind as any,
        i === 3 ? firstParagraph : `Section ${i + 1} stays intact.`,
      ),
  );
  return (await (
    await request.post("/api/import", { data: { document: doc } })
  ).json()) as Document;
}
async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  await expect(page.getByTestId("writing-section")).toHaveCount(6);
}
async function identity(page: Page, doc: Document) {
  await expect(page.getByTestId("writing-section")).toHaveCount(6);
  expect(
    await page
      .getByTestId("writing-section")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("id"))),
  ).toEqual(doc.sections.map((s) => s.id));
  expect(
    await page
      .getByTestId("structure-item")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-section-id")),
      ),
  ).toEqual(doc.sections.map((s) => s.id));
}
async function saved(page: Page, request: APIRequestContext, doc: Document) {
  await page.getByTestId("save-state").click();
  await expect(page.getByTestId("save-state")).toHaveText("Saved");
  const result = (await (
    await request.get("/api/documents/" + doc.id)
  ).json()) as Document;
  expect(result.sections.map((s) => s.id)).toEqual(
    doc.sections.map((s) => s.id),
  );
  return result;
}
async function firstSelection(page: Page, length: number) {
  await page.getByTestId("writing-editor").focus();
  await page
    .getByTestId("writing-section")
    .nth(3)
    .evaluate((el, length) => {
      const node = document
        .createTreeWalker(el, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      const sel = window.getSelection()!;
      sel.setBaseAndExtent(node, 0, node, length);
      document.dispatchEvent(new Event("selectionchange"));
    }, length);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(firstParagraph.slice(0, length));
}
async function selectLastSection(page: Page) {
  await page.getByTestId("writing-editor").focus();
  await page
    .getByTestId("writing-section")
    .last()
    .evaluate((el) => {
      const node = document
        .createTreeWalker(el, NodeFilter.SHOW_TEXT)
        .nextNode()!;
      window
        .getSelection()!
        .setBaseAndExtent(node, 0, node, node.textContent!.length);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Section 6 stays intact.");
}
async function undoRedo(
  page: Page,
  before: string,
  after: string,
  doc: Document,
) {
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(before, {
    useInnerText: true,
  });
  await identity(page, doc);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(after);
  await identity(page, doc);
}

test("heading toggles on the first and last paragraphs of a card without boundary warnings", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const id = doc.sections[3].id;
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  const card = page.locator(`[data-section-id="${id}"]`);
  const prompt = card.getByTestId("card-writing").getByRole("button");
  if (await prompt.count()) await prompt.press("Enter");
  const section = page.locator(`[id="${id}"]`);
  await section.locator("p").click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(section.locator("h2")).toHaveText(firstParagraph);
  await expect(
    page.getByText("Section boundaries are protected.", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(section.locator("p")).toHaveText(firstParagraph);
  await identity(page, doc);
});

test("first and last paragraphs format locally while cross-section formatting is refused", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  doc.sections[3].content = newSection(
    "Reveal",
    "First line.\nMiddle line.\nLast line.",
  ).content;
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  const id = doc.sections[3].id;
  const card = page.locator(`[data-section-id="${id}"]`);
  await card.locator(".section-focus").click();
  const prompt = card.getByTestId("card-writing").getByRole("button");
  if (await prompt.count()) await prompt.press("Enter");
  const section = page.locator(`[id="${id}"]`);
  for (const index of [0, 2]) {
    await section
      .locator("p")
      .nth(index === 0 ? 0 : -1)
      .click();
    await page.getByRole("button", { name: "Heading", exact: true }).click();
    await expect(section.locator("h2")).toHaveCount(index === 0 ? 1 : 2);
  }
  await section.locator("h2").first().click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(section.locator("p").first()).toHaveText("First line.");
  await identity(page, doc);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByTestId("writing-editor").focus();
  await page.evaluate(
    ([firstId, secondId]) => {
      const first = document
        .getElementById(firstId)!
        .querySelector("h2")!.firstChild!;
      const second = document
        .getElementById(secondId)!
        .querySelector("p")!.firstChild!;
      window.getSelection()!.setBaseAndExtent(first, 0, second, 6);
      document.dispatchEvent(new Event("selectionchange"));
    },
    [id, doc.sections[4].id],
  );
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(
    page.getByText("Section boundaries are protected.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(`[id="${doc.sections[4].id}"] p`)).toHaveText(
    "Section 5 stays intact.",
  );
  await identity(page, doc);
});

test("heading clamps a neighboring wrapper edge to the intended section", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await page.getByTestId("writing-editor").focus();
  await page.evaluate(
    ([previousId, nextId]) => {
      const previous = document
        .getElementById(previousId)!
        .querySelector("p")!.firstChild!;
      const next = document
        .getElementById(nextId)!
        .querySelector("p")!.firstChild!;
      window
        .getSelection()!
        .setBaseAndExtent(previous, previous.textContent!.length, next, 7);
      document.dispatchEvent(new Event("selectionchange"));
    },
    [doc.sections[2].id, doc.sections[3].id],
  );
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await expect(page.locator(`[id="${doc.sections[3].id}"] h2`)).toHaveText(
    firstParagraph,
  );
  await expect(page.locator(`[id="${doc.sections[2].id}"] p`)).toHaveText(
    "Section 3 stays intact.",
  );
  await expect(
    page.getByText("Section boundaries are protected.", { exact: false }),
  ).toHaveCount(0);
  await identity(page, doc);
});

test("native first sentence and last paragraph replacement preserve six section identities through undo/redo", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await firstSelection(page, firstSentence.length);
  await page.keyboard.insertText("Use tools to help.");
  const after = "Use tools to help. A second sentence stays.";
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(after);
  await undoRedo(page, firstParagraph, after, doc);
  await selectLastSection(page);
  await page.keyboard.insertText("The ending is still independent.");
  await expect(page.getByTestId("writing-section").last()).toHaveText(
    "The ending is still independent.",
  );
  await identity(page, doc);
  const result = await saved(page, request, doc);
  for (const i of [0, 1, 2, 4])
    expect(result.sections[i].content).toEqual(doc.sections[i].content);
  await page.reload();
  await identity(page, doc);
});

test("rich paste at a native outer slice edge replaces only Reveal content, never its wrapper", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByTestId("writing-editor").evaluate((root, length) => {
    const section = root.querySelectorAll("section")[3];
    const text = document
      .createTreeWalker(section, NodeFilter.SHOW_TEXT)
      .nextNode()!;
    (root as HTMLElement).focus();
    // Reproduces a browser slice beginning outside the first paragraph/section.
    window.getSelection()!.setBaseAndExtent(root, 3, text, length);
    document.dispatchEvent(new Event("selectionchange"));
  }, firstSentence.length);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe(firstSentence);
  await page.evaluate(() =>
    navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(
          [
            '<section data-writing-section id="clipboard-identity"><p><strong>Precisely replaced.</strong></p></section>',
          ],
          { type: "text/html" },
        ),
        "text/plain": new Blob(["Precisely replaced."], { type: "text/plain" }),
      }),
    ]),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("writing-section").nth(3)).toContainText(
    "Precisely replaced.",
  );
  await expect(
    page.getByTestId("writing-section").nth(3).locator("strong"),
  ).toHaveText("Precisely replaced.");
  await identity(page, doc);
  const after = await page.getByTestId("writing-section").nth(3).innerText();
  await undoRedo(page, firstParagraph, after, doc);
  const result = await saved(page, request, doc);
  for (const i of [0, 1, 2, 4, 5])
    expect(result.sections[i].content).toEqual(doc.sections[i].content);
});

test("a selection beginning at Segue's trailing content edge can replace only Reveal prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByTestId("writing-editor").evaluate((root, length) => {
    const sections = root.querySelectorAll("section");
    const previous = document
      .createTreeWalker(sections[2], NodeFilter.SHOW_TEXT)
      .nextNode()!;
    const reveal = document
      .createTreeWalker(sections[3], NodeFilter.SHOW_TEXT)
      .nextNode()!;
    (root as HTMLElement).focus();
    window
      .getSelection()!
      .setBaseAndExtent(previous, previous.textContent!.length, reveal, length);
    document.dispatchEvent(new Event("selectionchange"));
  }, firstSentence.length);
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString().trim()))
    .toBe(firstSentence);
  await expect(page.locator(".target-box")).toContainText("SELECTED PASSAGE");
  await expect(page.locator(".target-box")).toContainText(firstSentence);
  await page.evaluate(() =>
    navigator.clipboard.writeText("A clearer beginning."),
  );
  await page.keyboard.press("ControlOrMeta+v");
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(
    "A clearer beginning. A second sentence stays.",
  );
  await expect(page.getByTestId("writing-section").nth(2)).toHaveText(
    "Section 3 stays intact.",
  );
  await identity(page, doc);
  expect((await saved(page, request, doc)).sections[2].content).toEqual(
    doc.sections[2].content,
  );
});

test("native cross-section copy remains available but typing, paste, Delete and Backspace are non-destructive", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const editor = page.getByTestId("writing-editor");
  const before = await editor.innerText();
  await editor.focus();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+Shift+End");
  await page.keyboard.press("ControlOrMeta+c");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Section 6 stays intact.");
  for (const key of ["Delete", "Backspace", "ControlOrMeta+v"]) {
    await page.keyboard.press(key);
    await expect(editor).toHaveText(before, { useInnerText: true });
    await identity(page, doc);
  }
  await page.keyboard.insertText("Must not replace all sections");
  await expect(editor).toHaveText(before, { useInnerText: true });
  await expect(page.getByRole("status")).toContainText(/section/i);
  const result = await saved(page, request, doc);
  expect(result.sections.map((s) => s.content)).toEqual(
    doc.sections.map((s) => s.content),
  );
});

test("empty Reveal cannot Backspace/Delete into Segue, and the empty last section is retained", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await firstSelection(page, firstParagraph.length);
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText("");
  for (const key of ["Backspace", "Delete"]) {
    await page.keyboard.press(key);
    await identity(page, doc);
    await expect(page.getByTestId("writing-section").nth(3)).toHaveText("");
  }
  await selectLastSection(page);
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("writing-section").last()).toHaveText("");
  for (const key of ["Delete", "Backspace"]) {
    await page.keyboard.press(key);
    await identity(page, doc);
  }
  const result = await saved(page, request, doc);
  for (const i of [0, 1, 2, 4])
    expect(result.sections[i].content).toEqual(doc.sections[i].content);
});

for (const scope of ["first word", "first sentence"] as const) {
  test(`Word Lens / AI accepts ${scope} in Reveal without merging Segue; undo/redo preserve IDs`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    await open(page);
    await firstSelection(
      page,
      scope === "first word" ? "Assumed".length : firstSentence.length,
    );
    if (scope === "first word") {
      await expect(
        page.getByRole("region", { name: "Word Lens" }),
      ).toBeVisible();
      await page
        .getByRole("group", { name: "Lens mode" })
        .getByRole("button", { name: "Replace", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Find replacements", exact: true })
        .click();
    } else {
      await page
        .getByLabel("Writing action", { exact: true })
        .selectOption("shorten");
      await page.getByRole("button", { name: /Diagnose this/ }).click();
      await expect(page.locator(".diagnosis")).toContainText("OFFLINE");
      await page
        .getByLabel("Your material")
        .fill("Keep the thought. Remove the extra connector words.");
      await page.getByRole("button", { name: "Propose options" }).click();
    }
    const proposal = page.getByLabel("Edit proposal 1");
    await expect(proposal).toBeVisible();
    const replacement = scope === "first word" ? "Use" : "Use tools to help.";
    await proposal.fill(replacement);
    // The persisted PM target highlight remains while a proposal input owns focus.
    await expect(
      page.getByTestId("writing-editor").locator(".target-highlight").first(),
    ).toBeVisible();
    await page.getByTestId("accept-proposal").first().click();
    const after =
      scope === "first word"
        ? firstParagraph.replace("Assumed", replacement)
        : replacement + " A second sentence stays.";
    await expect(page.getByTestId("writing-section").nth(3)).toHaveText(after);
    await undoRedo(page, firstParagraph, after, doc);
    const result = await saved(page, request, doc);
    for (const i of [0, 1, 2, 4, 5])
      expect(result.sections[i].content).toEqual(doc.sections[i].content);
  });
}

test("last sentence of the preceding Segue and punctuation beside Reveal preserve all markers", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const editor = page.getByTestId("writing-editor");
  await editor.focus();
  await page
    .getByTestId("writing-section")
    .nth(2)
    .evaluate((el) => {
      const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
      window.getSelection()!.setBaseAndExtent(n, 0, n, n.textContent!.length);
      document.dispatchEvent(new Event("selectionchange"));
    });
  await page.keyboard.insertText("A revised bridge.");
  await expect(page.getByTestId("writing-section").nth(2)).toHaveText(
    "A revised bridge.",
  );
  await identity(page, doc);
  await page.keyboard.press("Delete");
  await identity(page, doc);
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(
    firstParagraph,
  );
  await firstSelection(page, 0);
  await page.keyboard.press("Backspace");
  await identity(page, doc);
  await page.keyboard.insertText("— ");
  await expect(page.getByTestId("writing-section").nth(3)).toHaveText(
    "— " + firstParagraph,
  );
  await identity(page, doc);
  await saved(page, request, doc);
});
