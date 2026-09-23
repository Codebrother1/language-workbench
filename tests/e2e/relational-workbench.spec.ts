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
  uid,
} from "../../packages/domain/src/index";
async function reset(request: APIRequestContext, empty = true) {
  for (const d of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  const doc = newDocument(
    "Relational writing",
    empty ? "" : "First thought. Second thought.",
  );
  if (!empty) {
    doc.sections.push(newSection("Segue", "Bridge stays here."));
    doc.sections.push(
      newSection("Reveal", "The reveal begins here. Its ending remains."),
    );
  }
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
async function focus(page: Page, index: number) {
  await page
    .getByTestId("structure-item")
    .nth(index)
    .locator(".section-focus")
    .click();
}
async function select(page: Page, text: string, collapsed = false) {
  await page.getByTestId("writing-editor").focus();
  await page.getByTestId("writing-editor").evaluate(
    (root, { text, collapsed }) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const i = (n.textContent ?? "").indexOf(text);
        if (i < 0) continue;
        const sel = window.getSelection()!;
        const start = collapsed ? i + Math.min(2, text.length) : i;
        sel.setBaseAndExtent(n, start, n, collapsed ? start : i + text.length);
        document.dispatchEvent(new Event("selectionchange"));
        return;
      }
      throw Error("Text not found");
    },
    { text, collapsed },
  );
}
async function choose(page: Page, kind: string) {
  await page
    .getByRole("dialog", { name: "Insert section", exact: true })
    .getByLabel("All section types")
    .selectOption(kind);
  await page.getByRole("button", { name: "Insert selected type" }).click();
}

test("empty Segue storyboard + neighbors → coaching → relational comparison → activation keeps same section", async ({
  page,
  request,
}) => {
  const doc = await reset(request);
  await open(page);
  await expect(
    page.getByRole("button", { name: "Workbench", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await focus(page, 0);
  await page.locator(".section-options > summary").click();
  await page.getByLabel("Semantic kind").selectOption("Segue");
  const note =
    "Delay the connection and move from the emotional story into the technical explanation.";
  await page.getByLabel("Section notes · AI context").fill(note);
  await expect(
    page.getByRole("button", { name: "Diagnose this section" }),
  ).toBeEnabled();
  let segue = page.getByTestId("structure-item").first();
  await segue
    .getByRole("button", { name: "+ Add before", exact: true })
    .click();
  await choose(page, "Point");
  await page.keyboard.insertText(
    "The audience felt the impact before anyone explained it.",
  );
  await focus(page, 1);
  segue = page.getByTestId("structure-item").nth(1);
  await segue.getByRole("button", { name: "+ Add after", exact: true }).click();
  await choose(page, "Reveal");
  await page.keyboard.insertText(
    "The measurements explain the result. This sentence stays.",
  );
  await focus(page, 1);
  const relational = page.getByTestId("relational-context");
  await expect(relational).toContainText("The audience felt");
  await expect(relational).toContainText("The measurements");
  await expect(relational).toContainText(note);
  await expect(page.locator(".target-box")).toContainText("No prose yet");
  const requestEvent = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page.getByRole("button", { name: "Diagnose this section" }).click();
  const sent = (await requestEvent).postDataJSON();
  expect(sent.editTarget.text).toBe("");
  expect(sent.editTarget.scope).toBe("section");
  expect(sent.readContext.document.sections[1].notes).toBe(note);
  await expect(page.locator(".diagnosis")).toContainText("empty");
  await page
    .getByLabel("Your material")
    .fill(
      "The feeling came first; the measurements explain why.\nHere is what the measurements can actually tell us.",
    );
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("proposal")).toHaveCount(2);
  await save(page);
  let stored = await (await request.get("/api/documents/" + doc.id)).json();
  const segueId = stored.sections[1].id;
  expect(documentText({ ...stored, sections: [stored.sections[1]] })).toBe("");
  await page.getByRole("button", { name: "Compare Segue versions" }).click();
  const compare = page.getByRole("dialog", { name: "Compare this connection" });
  await expect(compare.getByTestId("previous-section")).toContainText(
    "The audience felt",
  );
  await expect(compare.getByTestId("next-section")).toContainText(
    "The measurements",
  );
  await expect(compare.getByTestId("compare-version")).toHaveCount(2);
  const a = await compare.getByTestId("compare-version").nth(0).boundingBox(),
    b = await compare.getByTestId("compare-version").nth(1).boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(10);
  expect(b!.x).toBeGreaterThan(a!.x);
  await page.screenshot({
    path: "artifacts/relational-compare.png",
    fullPage: true,
  });
  await compare
    .getByRole("button", { name: "Use this version" })
    .first()
    .click();
  await expect(page.locator(".structure-item.active")).toHaveAttribute(
    "data-section-id",
    segueId,
  );
  await expect(compare.getByTestId("compare-canonical")).toContainText(
    "The feeling came first",
  );
  await compare.getByRole("button", { name: "Back to this Segue" }).click();
  await expect(page.locator(".lab-head")).toContainText("Segue workbench");
  await expect(page.locator(".structure-item.active")).toHaveAttribute(
    "data-section-id",
    segueId,
  );
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await select(page, "The measurements explain the result.");
  await page.keyboard.insertText("The data explains the result.");
  await expect(page.getByTestId("writing-section")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "The measurements explain the result.",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "The data explains the result.",
  );
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  await focus(page, 1);
  await save(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Workbench", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".structure-item.active")).toHaveAttribute(
    "data-section-id",
    segueId,
  );
  await expect(page.getByLabel("Your material")).toHaveValue(
    /The feeling came first/,
  );
  await page.screenshot({
    path: "artifacts/relational-workbench.png",
    fullPage: true,
  });
});
test("target-specific directions restore separately for two sentences and survive reload", async ({
  page,
  request,
}) => {
  const doc = await reset(request, false);
  await open(page);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  await select(page, "First thought.", true);
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Only the first thought should be sharper.");
  await select(page, "Second thought.", true);
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Only the second should be softer.");
  await select(page, "First thought.", true);
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Only the first thought should be sharper.",
  );
  await expect(
    page.getByTestId("writing-editor").locator(".target-highlight"),
  ).toHaveText("First thought.");
  await save(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Document View", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Only the first thought should be sharper.",
  );
  expect(
    await (await request.get("/api/documents/" + doc.id)).json(),
  ).toHaveProperty("focusTarget");
});
test("comfortable cards expose meaningful prose/notes; overview and narrow layout persist without an overlay", async ({
  page,
  request,
}) => {
  let doc = await reset(request, false);
  doc.sections[0].notes =
    "This beat must make the reader question their first assumption.";
  doc.sections[0].modelOverride = { providerId: "mock", modelId: "plain" };
  await request.put("/api/documents/" + doc.id, { data: doc });
  await open(page);
  await focus(page, 0);
  await expect(page.getByTestId("structure-item").first()).toContainText(
    "Second thought.",
  );
  await expect(page.getByTestId("structure-item").first()).toContainText(
    "Offline plain",
  );
  await expect(page.getByLabel("Section notes · AI context")).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Document structure" }),
  ).toHaveClass(/density-overview/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Comfortable", exact: true }).click();
  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByRole("button", { name: "Hide preview", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).not.toBeVisible();
  const timeline = page.getByRole("navigation", { name: "Document structure" });
  expect((await timeline.boundingBox())!.width).toBeGreaterThan(700);
  expect(await timeline.evaluate((e) => getComputedStyle(e).position)).not.toBe(
    "fixed",
  );
  await page.screenshot({
    path: "artifacts/workbench-narrow.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Show preview", exact: true }).click();
  const t = await timeline.boundingBox(),
    p = await page.locator(".writing").boundingBox();
  expect(t!.x + t!.width).toBeLessThanOrEqual(p!.x + 1);
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
});
test("phrase search crosses item kinds through all-types lookup and Sources are document-level", async ({
  page,
  request,
}) => {
  const doc = await reset(request, false);
  const library = await (await request.get("/api/library")).json();
  await request.put("/api/library", {
    data: {
      ...library,
      items: [
        {
          id: uid(),
          kind: "style_example",
          title: "A closer I like",
          content: "que sera sera",
          sectionKinds: ["Closer"],
          myLanguage: true,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        },
      ],
    },
  });
  await open(page);
  await page.getByRole("button", { name: "Document sources" }).click();
  await expect(
    page.getByRole("dialog", { name: "Source material" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add reference" }).click();
  await page.getByLabel("Source text").fill("The source says precisely this.");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("button", { name: "Document sources" }),
  ).toContainText("1");
  await page.keyboard.press("Control+k");
  await page
    .getByRole("combobox", { name: "Search writing tools" })
    .fill("saved snippets");
  await page.keyboard.press("Enter");
  await page.getByLabel("Search Personal Library").fill("que sera");
  await page.getByRole("button", { name: "Search all types" }).click();
  await expect(page.locator(".library-entry")).toContainText("que sera sera");
  for (const q of ["sera", "que", "serra"]) {
    await page.getByLabel("Search Personal Library").fill(q);
    await expect(page.locator(".library-entry")).toContainText("que sera sera");
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  for (const q of ["reference material", "transcript", "paste source"]) {
    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search writing tools" }).fill(q);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Source material" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
});
test("direction field grows and selected text highlight survives Inspector focus in both themes", async ({
  page,
  request,
}) => {
  await reset(request, false);
  await open(page);
  await select(page, "First thought.");
  const field = page.getByLabel("Your direction", { exact: true });
  await field.fill("A substantial dictated instruction.\n".repeat(18));
  expect((await field.boundingBox())!.height).toBeGreaterThanOrEqual(250);
  expect((await field.boundingBox())!.height).toBeLessThanOrEqual(310);
  await expect(page.locator(".writing-editor .target-highlight")).toHaveText(
    "First thought.",
  );
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator(".writing-editor .target-highlight")).toHaveText(
    "First thought.",
  );
  await expect(page.locator(".writing-editor .target-highlight")).toBeVisible();
  await page.screenshot({
    path: "artifacts/target-highlight-dark.png",
    fullPage: true,
  });
});

test("saved Segue variant activation retains section selection, workbench direction and highlight", async ({
  page,
  request,
}) => {
  const doc = await reset(request, false);
  const text = "Bridge stays here.";
  const s = doc.sections[1];
  s.workbench = {
    instruction: "Keep the segue dry.",
    answer: "Human observation",
    action: "coach",
    controls: {},
    lens: {
      mode: "explore",
      fidelity: "balanced",
      shape: "word",
      intent: "Custom",
      persona: "",
      technical: false,
    },
    oneOffModel: null,
    compareModels: [],
    runs: [],
    activeRunId: null,
    proposalStates: {},
  };
  s.variants = [
    {
      id: uid(),
      label: "Dry alternative",
      text: "A quieter bridge.",
      target: {
        scope: "section",
        sectionId: s.id,
        start: 0,
        end: text.length,
        text,
        sectionSnapshot: text,
        documentId: doc.id,
        documentRevision: doc.revision,
      },
      createdAt: doc.createdAt,
      origin: "human",
    },
  ];
  await request.put("/api/documents/" + doc.id, { data: doc });
  await open(page);
  await focus(page, 1);
  await page.locator(".variants > summary").click();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.locator(".structure-item.active")).toHaveAttribute(
    "data-section-id",
    s.id,
  );
  await expect(page.locator(".target-box")).toContainText("A quieter bridge.");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Keep the segue dry.",
  );
  await expect(page.locator(".writing-editor .target-highlight")).toHaveText(
    "A quieter bridge.",
  );
  await save(page);
  await page.reload();
  await expect(page.locator(".structure-item.active")).toHaveAttribute(
    "data-section-id",
    s.id,
  );
});
