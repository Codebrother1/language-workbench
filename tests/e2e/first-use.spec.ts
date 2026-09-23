import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import {
  newDocument,
  defaultSettings,
  documentText,
} from "../../packages/domain/src/index";
async function seed(request: APIRequestContext, text = "") {
  for (const d of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument("A new thought", text);
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
async function palette(page: Page, query: string) {
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Find a writing tool" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Search writing tools" })
    .fill(query);
}
async function command(page: Page, query: string, label?: string) {
  await palette(page, query);
  if (label)
    await page.getByRole("option", { name: new RegExp(label) }).click();
  else
    await page
      .getByRole("combobox", { name: "Search writing tools" })
      .press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Find a writing tool" }),
  ).toHaveCount(0);
}
async function canonical(request: APIRequestContext, id: string) {
  return documentText(await (await request.get("/api/documents/" + id)).json());
}
async function select(page: Page, text: string) {
  await page.getByTestId("writing-editor").evaluate((root, text) => {
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) {
      const i = (n.textContent ?? "").indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      (root as HTMLElement).focus();
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw Error("Missing text");
  }, text);
}

test("empty document has one obvious writing path and a simple Inspector, with no setup barrier", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await expect(
    page.getByText("Start with what’s in your head.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Talk or type a thought", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const inspector = page.getByRole("complementary", {
    name: "Contextual writing inspector",
  });
  await expect(inspector).toContainText("Start anywhere");
  await expect(inspector.locator("select")).toHaveCount(0);
  await expect(inspector.locator("input,textarea")).toHaveCount(0);
  await expect(
    inspector.locator(".structure-tool,.model-controls,.variants"),
  ).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/first-use-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Talk or type a thought" }).click();
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await page.keyboard.insertText("A messy thought, not an article yet.");
  await expect(page.locator(".first-move")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Possible next steps" }),
  ).toBeVisible();
  await expect(inspector.getByText("Your thought is here.")).toBeVisible();
});
test("the prompts can be ignored: direct typing, slash, paste and native undo work", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  await page.keyboard.insertText("Just write / no setup.");
  await expect(editor).toContainText("Just write / no setup.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(editor).toHaveText("");
  await page.keyboard.press("Control+Shift+z");
  await expect(editor).toContainText("Just write / no setup.");
  await save(page);
  const data = await (await request.get("/api/documents/" + doc.id)).json();
  expect(data.brief.contentType).toBe("freeform");
  expect(data.brief.audience).toBe("");
  await palette(page, "synonyms");
  await page.keyboard.press("Escape");
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Just write / no setup.",
  );
});
test("paste entry uses the existing source editor and keeps reference separate", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page
    .getByRole("button", { name: "Paste something", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Source material" }),
  ).toBeVisible();
  const source = page.getByLabel("Source text", { exact: true });
  await expect(source).toBeFocused();
  await source.fill("Their comment stays a reference, not my opinion.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  const stored = await (await request.get("/api/documents/" + doc.id)).json();
  expect(stored.sources).toHaveLength(1);
  expect(stored.sources[0].text).toContain("Their comment");
  expect(documentText(stored)).toBe("");
  await expect(
    page.getByRole("button", { name: "Talk or type a thought" }),
  ).toBeVisible();
});
test("Writing Brief is understandable and optional before or after writing", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page
    .getByRole("button", { name: "I know what I’m writing", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Writing brief" }),
  ).toContainText("What are you making?");
  await expect(page.getByRole("dialog")).toContainText("optional");
  await page.getByLabel("Content type").selectOption("reply");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByTestId("writing-editor").click();
  await page.keyboard.insertText("One sentence is enough.");
  await command(page, "writing brief");
  await expect(
    page.getByRole("dialog", { name: "Writing brief" }),
  ).toBeVisible();
  await page.getByLabel("Audience").fill("One person in the conversation");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await save(page);
  expect(await canonical(request, doc.id)).toBe("One sentence is enough.");
});
test("a newcomer can write, make a Hook, add a Point and discover the rest without documentation", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Talk or type a thought" }).click();
  await page.keyboard.insertText(
    "I liked the tool but the bill surprised me and I noticed it too late.",
  );
  const original = await page.getByTestId("writing-editor").innerText();
  await page
    .getByRole("button", { name: "Make this a hook", exact: true })
    .click();
  await expect(page.locator(".lab-head")).toContainText("Hook workbench");
  await expect(page.getByTestId("writing-editor")).toHaveText(original);
  await page
    .getByRole("navigation", { name: "Possible next steps" })
    .getByRole("button", { name: "Add a point", exact: true })
    .click();
  await page.keyboard.insertText("The cost was hidden in the usage counter.");
  await expect(page.getByTestId("structure-item")).toHaveCount(2);
  const pointId = await page
    .getByTestId("structure-item")
    .nth(1)
    .getAttribute("data-section-id");
  const plus = page.locator(
    `[data-testid="insert-at-gap"][data-before-section-id="${pointId}"]`,
  );
  await plus.focus();
  await plus.click();
  await expect(
    page.getByRole("dialog", { name: "Insert section" }),
  ).toContainText("Connect two thoughts");
  await page.getByRole("button", { name: "Insert Segue", exact: true }).click();
  await page.keyboard.insertText("That changed how I read the price.");
  await expect(page.getByTestId("structure-item")).toHaveCount(3);
  await command(page, "synonyms");
  await expect(page.getByRole("status")).toContainText("Select a word");
  await select(page, "surprised");
  await command(page, "replace word");
  await expect(page.getByRole("region", { name: "Word Lens" })).toBeVisible();
  await expect(page.locator(".word-lens")).toBeInViewport();
  await command(page, "saved snippets");
  await expect(
    page.getByRole("dialog", { name: "Personal Writing Library" }),
  ).toBeVisible();
  await expect(page.getByLabel("Library view")).toHaveValue("snippet");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await command(page, "structure");
  await expect(page.locator(".structure-tool")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Thought A · main thought")).toBeFocused();
  await command(page, "change model");
  await expect(page.locator(".model-controls")).toHaveAttribute("open", "");
  await command(page, "keep writing");
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await save(page);
  const data = await (await request.get("/api/documents/" + doc.id)).json();
  expect(data.sections.map((s: any) => s.kind)).toEqual([
    "Hook",
    "Segue",
    "Point",
  ]);
  expect(data.sections[0].content[0].content[0].text).toBe(original);
});
test("command palette keyboard navigation discovers existing tools without generation or writes", async ({
  page,
  request,
}) => {
  const doc = await seed(request, "A sentence about language.");
  await open(page);
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/ai")) calls.push(r.url());
  });
  await palette(page, "model");
  await page
    .getByRole("combobox", { name: "Search writing tools" })
    .press("ArrowDown");
  await expect(
    page
      .getByRole("dialog", { name: "Find a writing tool" })
      .getByRole("option", { selected: true }),
  ).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await command(page, "my hooks");
  await expect(page.getByLabel("Search Personal Library")).toHaveValue("Hook");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await command(page, "style guide");
  await expect(
    page.getByRole("dialog", { name: "Scoped Style Guides" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await command(page, "language radar");
  await expect(
    page.getByRole("dialog", { name: "Language radar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await command(page, "writing history");
  await expect(
    page.getByRole("dialog", { name: "Operation history" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await command(page, "copy document");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("A sentence about language.");
  expect(calls).toEqual([]);
  expect(await canonical(request, doc.id)).toBe("A sentence about language.");
});
test("thought discovery copies into existing builder without rewriting or reorganizing the page", async ({
  page,
  request,
}) => {
  const text =
    "I liked the tool but it cost too much and I only noticed later.";
  const doc = await seed(request, text);
  await open(page);
  await page
    .getByRole("button", { name: "Organize these thoughts", exact: true })
    .click();
  await expect(page.locator(".structure-tool")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Raw thoughts")).toHaveValue(text);
  await expect(page.locator(".thought-unit")).not.toHaveCount(0);
  await expect(page.getByTestId("writing-editor")).toHaveText(text);
  await command(page, "turn thoughts into sections");
  await expect(
    page.getByRole("navigation", { name: "Document structure" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Nothing was reorganized",
  );
  await save(page);
  expect(
    (await (await request.get("/api/documents/" + doc.id)).json()).sections,
  ).toHaveLength(1);
});
test("context help changes with Hook, Segue and selected word; technical tools route without running AI", async ({
  page,
  request,
}) => {
  await seed(request, "The useful thought is here.");
  await open(page);
  await page
    .getByRole("button", { name: "Make this a hook", exact: true })
    .click();
  await command(page, "what can");
  await expect(page.locator(".context-help")).toContainText("a Hook");
  await command(page, "add segue");
  await page.keyboard.insertText("A link to the next thought.");
  await command(page, "what can");
  await expect(page.locator(".context-help")).toContainText("a Segue");
  await select(page, "link");
  await command(page, "what can");
  await expect(page.locator(".context-help")).toContainText("selected word");
  await command(page, "technical writing");
  await page
    .locator(".word-lens")
    .getByText("Intent, register & era", { exact: true })
    .click();
  await expect(
    page.getByLabel("Technical precision", { exact: true }),
  ).toBeChecked();
});
test("new-entry dark mode and command palette preserve the existing visual register", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "artifacts/first-use-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Find a tool", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search writing tools" })
    .fill("source");
  await page.screenshot({
    path: "artifacts/command-palette-dark.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByTestId("writing-editor").click();
  await page.keyboard.insertText("Still a normal editor.");
  await expect(page.getByTestId("writing-editor")).toHaveCSS(
    "font-size",
    "22px",
  );
});
test("starting from structure never forces a template or Writing Brief", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page
    .getByRole("button", { name: "Start from structure", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Insert section" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("All section types").locator("option"),
  ).toHaveCount(27);
  await page.getByRole("button", { name: "Insert Point", exact: true }).click();
  await page.keyboard.insertText("Begin with the point, not a hook.");
  await expect(page.getByRole("dialog", { name: "Writing brief" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("writing-editor")).toContainText(
    "Begin with the point",
  );
});

test("Cmd shortcut and empty-page Structure discovery work without duplicating the editor", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.keyboard.press("Meta+k");
  await expect(
    page.getByRole("dialog", { name: "Find a writing tool" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Search writing tools" })
    .fill("structure");
  await page.keyboard.press("Enter");
  await expect(page.locator(".structure-tool")).toHaveAttribute("open", "");
  await expect(page.getByLabel("Thought A · main thought")).toBeFocused();
  await expect(page.getByTestId("writing-editor")).toHaveCount(1);
  await expect(page.getByTestId("writing-editor")).toHaveText("");
  await command(page, "keep writing");
  await expect(page.getByTestId("writing-editor")).toBeFocused();
  await page.keyboard.insertText("A real thought now.");
  await expect(page.getByTestId("writing-editor")).toHaveText(
    "A real thought now.",
  );
});

test("explicit search can reveal an empty section’s variants without forcing text or setup", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await command(page, "variants");
  await expect(page.locator(".variants")).toHaveAttribute("open", "");
  await expect(page.locator(".variants")).toContainText("Saved alternatives");
  await expect(page.getByTestId("writing-editor")).toHaveText("");
});

test("rapid start/end navigation cannot race subsequent typing or extend selection outside the page", async ({
  page,
  request,
}) => {
  await seed(request, "Start here.");
  await open(page);
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" End.");
    await page.keyboard.press("Control+Home");
    await page.keyboard.type("Begin. ");
  }
  await expect(editor).toHaveText(
    "Begin. ".repeat(8) + "Start here." + " End.".repeat(8),
  );
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Control+Shift+Home");
  const selected = await page.evaluate(() => window.getSelection()?.toString());
  expect(selected).toContain("Start here.");
  expect(selected).not.toContain("Find a tool");
});
