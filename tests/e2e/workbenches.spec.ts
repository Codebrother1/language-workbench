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
  modelKey,
} from "../../packages/domain/src/index";
const conservative = { providerId: "mock", modelId: "conservative" },
  plain = { providerId: "mock", modelId: "plain" };
async function seed(request: APIRequestContext) {
  for (const d of await (await request.get("/api/documents")).json())
    await request.delete("/api/documents/" + d.id, {
      headers: { "Content-Type": "application/json" },
    });
  await request.put("/api/settings", { data: defaultSettings() });
  await request.patch("/api/providers/mock", { data: { enabled: true } });
  const doc = newDocument(
    "Language objects",
    "His ass is larping. The rest stays mine.",
  );
  doc.sections[0].kind = "Hook";
  doc.sections[0].label = "Hook";
  doc.sections.push(
    newSection(
      "Segue",
      "I really utilize this bridge in order to connect the ideas.",
    ),
  );
  doc.sections.push(
    newSection("Point", "The cache keeps the last successful response."),
  );
  doc.sections.push(newSection("Closer", "No borrowed certainty."));
  doc.brief.audience = "Older readers with no background in software";
  doc.brief.customNotes =
    "Technical writing: explain precisely; keep my attitude.";
  doc.sources = [
    {
      id: "source",
      title: "Actual quotation",
      kind: "quote",
      text: "The system serves the last response.",
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
async function section(page: Page, label: string) {
  await page
    .getByRole("button", { name: new RegExp("^\\d{2} " + label + "$") })
    .click();
}
async function select(page: Page, text: string) {
  await page.getByTestId("writing-editor").evaluate((el, text) => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const i = (n.textContent ?? "").indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + text.length);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      (el as HTMLElement).focus();
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw Error("Missing text " + text);
  }, text);
}
async function stored(request: APIRequestContext, id: string) {
  return (await request.get("/api/documents/" + id)).json();
}
async function models(page: Page) {
  const details = page.locator(".model-controls");
  if (!(await details.evaluate((e) => e.hasAttribute("open"))))
    await details.locator("> summary").click();
}
async function diagnose(page: Page, action = "coach") {
  await page.getByLabel("Writing action", { exact: true }).selectOption(action);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText("OFFLINE");
}
async function replacements(page: Page) {
  await page
    .getByRole("group", { name: "Lens mode" })
    .getByRole("button", { name: "Replace", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Find replacements", exact: true })
    .click();
  await expect(page.getByTestId("proposal").first()).toBeVisible();
}

test("Lab refreshes a restarted server's configured provider before a routed run", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Segue");
  await expect(page.locator(".inspector-top .provider")).toHaveText(
    "Mock · local",
  );
  const baseline = await (await request.get("/api/providers")).json();
  const live = { providerId: "openai", modelId: "gpt-6-luna" };
  const catalog = {
    ...baseline,
    applicationDefault: live,
    providers: baseline.providers.map(
      (provider: { id: string; models: { id: string }[] }) =>
        provider.id === "openai"
          ? {
              ...provider,
              configured: true,
              enabled: true,
              status: "Ready",
              credentialSuffix: null,
              models: [
                ...provider.models.filter(
                  (entry: { id: string }) => entry.id !== live.modelId,
                ),
                {
                  id: live.modelId,
                  providerId: "openai",
                  displayName: live.modelId,
                  capabilities: {},
                  metadata: { source: "environment default" },
                },
              ],
            }
          : provider,
    ),
  };
  await page.route("**/api/providers", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: { ok: true, provider: "openai", webResearch: false },
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".inspector-top .provider")).toHaveText(
    "OpenAI Direct",
  );
  await expect(page.locator(".model-controls > summary")).toContainText(
    "gpt-6-luna · OpenAI Direct",
  );
  await models(page);
  await expect(
    page
      .getByLabel("Run with", { exact: true })
      .locator("option")
      .filter({ hasText: "gpt-6-luna · OpenAI Direct" }),
  ).toBeEnabled();
  await page.route("**/api/ai", (route) =>
    route.fulfill({
      json: {
        provider: "openai",
        diagnosis: "Synthetic live-provider diagnosis.",
        mechanism: "Fixture only.",
        question: "What matters next?",
        missingIngredients: [],
        proposals: [],
        findings: [],
        lexical: [],
        model: live,
        routeSource: "application",
      },
    }),
  );
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.getByTestId("run-model")).toContainText(
    "gpt-6-luna · OpenAI Direct · application",
  );
  await save(page);
  const after = await stored(request, doc.id);
  expect(after.sections[1].workbench.runs[0].model).toEqual(live);
  expect(documentText(after)).toBe(documentText(doc));
});

test("Hook and Segue preserve separate drafts, questions and runs across focus and reload", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Hook");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Exaggerate the fake-status part; keep larping.");
  await diagnose(page);
  await page.getByLabel("Your material").fill("He acts like he owns the room.");
  await section(page, "Segue");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".response")).toHaveCount(0);
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Connect the hook to the technical explanation.");
  await diagnose(page, "shorten");
  await page
    .getByLabel("Your material")
    .fill("Keep the connection, trim the filler.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("proposal")).toBeVisible();
  await section(page, "Hook");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Exaggerate the fake-status part; keep larping.",
  );
  await expect(page.getByLabel("Your material")).toHaveValue(
    "He acts like he owns the room.",
  );
  await save(page);
  let data = await stored(request, doc.id);
  expect(documentText(data)).toBe(documentText(doc));
  expect(data.sections[0].workbench.runs).toHaveLength(1);
  expect(data.sections[1].workbench.runs).toHaveLength(2);
  await page.reload();
  await section(page, "Segue");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Connect the hook to the technical explanation.",
  );
  await expect(page.getByTestId("proposal")).toBeVisible();
  await page.screenshot({
    path: "artifacts/section-workbench.png",
    fullPage: true,
  });
});
test("different section models persist; one-off run overrides only one request", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Hook");
  await models(page);
  await page
    .getByLabel("Section model", { exact: true })
    .selectOption(modelKey(conservative));
  await section(page, "Segue");
  await models(page);
  await page
    .getByLabel("Section model", { exact: true })
    .selectOption(modelKey(plain));
  await section(page, "Hook");
  await models(page);
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(modelKey(plain));
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await expect(page.getByLabel("Run with", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Section model", { exact: true })).toHaveValue(
    modelKey(conservative),
  );
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText(
    "Offline conservative",
  );
  await save(page);
  const data = await stored(request, doc.id);
  expect(data.sections[0].modelOverride).toEqual(conservative);
  expect(data.sections[1].modelOverride).toEqual(plain);
  expect(
    data.sections[0].workbench.runs.map((r: any) => r.model.modelId),
  ).toEqual(["plain", "conservative"]);
  expect(documentText(data)).toBe(documentText(doc));
  await page.reload();
  await section(page, "Segue");
  await models(page);
  await expect(page.getByLabel("Section model", { exact: true })).toHaveValue(
    modelKey(plain),
  );
});
test("section-type defaults and document fallback use the same resolver", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  await page
    .getByLabel("Document default model", { exact: true })
    .selectOption(modelKey(plain));
  await page.getByRole("button", { name: "Close dialog" }).click();
  await section(page, "Hook");
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await expect(page.getByTestId("run-model")).toContainText("document");
  await models(page);
  await page
    .getByLabel("Section model", { exact: true })
    .selectOption(modelKey(conservative));
  await page
    .getByRole("button", { name: "Set default for Hook", exact: true })
    .click();
  await page.getByRole("button", { name: "Use inherited default" }).click();
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText("section type");
  await expect(page.getByTestId("run-model")).toContainText(
    "Offline conservative",
  );
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("Segue reads preceding and following sections but explicit Accept edits only Segue", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Segue");
  const calls: any[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai")) calls.push(r.postDataJSON());
  });
  await diagnose(page, "shorten");
  await page.getByLabel("Your material").fill("Keep the meaning.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("proposal")).toBeVisible();
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  expect(
    calls[0].readContext.document.sections.map((s: any) => s.kind),
  ).toEqual(["Hook", "Segue", "Point", "Closer"]);
  expect(calls[0].editTarget.sectionId).toBe(doc.sections[1].id);
  await page.getByTestId("accept-proposal").click();
  await save(page);
  const data = await stored(request, doc.id);
  expect(data.sections[0].content).toEqual(doc.sections[0].content);
  expect(data.sections[2].content).toEqual(doc.sections[2].content);
  expect(data.sections[3].content).toEqual(doc.sections[3].content);
  expect(data.sections[1].content).not.toEqual(doc.sections[1].content);
});
test("word candidates preserve canonical sentence; explicit Replace is surgical and undo works", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "larping");
  await expect(page.getByRole("region", { name: "Word Lens" })).toBeVisible();
  await page
    .getByLabel("Lexical direction", { exact: true })
    .fill(
      "Keep the disrespect but lose the internet slang. Imply performing false status.",
    );
  const calls: any[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai")) calls.push(r.postDataJSON());
  });
  await replacements(page);
  const candidate = await page.getByLabel("Edit proposal 1").inputValue();
  expect(candidate.split(/\s+/)).toHaveLength(1);
  await expect(page.getByTestId("sentence-preview").first()).toHaveText(
    "His ass is " + candidate + ".",
  );
  await page
    .getByRole("button", { name: "Copy candidate 1", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(candidate);
  await page
    .getByRole("button", { name: "Copy resulting sentence", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("His ass is " + candidate + ". ");
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  expect(calls[0].instruction).toContain("false status");
  expect(calls[0].lens).toMatchObject({ fidelity: "balanced", shape: "word" });
  expect(calls[0].editTarget.text).toBe("larping");
  await page.getByTestId("accept-proposal").first().click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "His ass is " + candidate + ". The rest stays mine.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "His ass is larping. The rest stays mine.",
  );
  await page.screenshot({ path: "artifacts/word-lens.png", fullPage: true });
});
test("phrase shape, fidelity, persona and technical audience reach the request; candidates remain editable", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "larping");
  await page.getByLabel("Replacement shape").selectOption("phrase");
  await page.getByLabel("Meaning fidelity").selectOption("loose");
  await page
    .getByLabel("Lexical direction", { exact: true })
    .fill("An educated but cutting description of fake social status.");
  await page.getByText("Intent, register & era", { exact: true }).click();
  await page
    .getByLabel("Persona / register / era")
    .fill("British aristocratic caricature, not a historical quotation");
  await page.getByLabel("Technical precision", { exact: true }).check();
  const pending = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await replacements(page);
  const input = (await pending).postDataJSON();
  expect(input.lens).toMatchObject({
    shape: "phrase",
    fidelity: "loose",
    technical: true,
  });
  expect(input.lens.persona).toContain("caricature");
  expect(input.readContext.document.brief.audience).toContain("Older readers");
  await page.getByLabel("Edit proposal 1").fill("putting on airs");
  await page.getByTestId("accept-proposal").first().click();
  await expect(page.getByTestId("writing-editor")).toContainText(
    "His ass is putting on airs. The rest stays mine.",
  );
  await select(page, "putting on airs");
  await expect(page.getByRole("region", { name: "Phrase Lens" })).toBeVisible();
  await page.getByLabel("Meaning fidelity").selectOption("exact");
  const req = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page.getByRole("button", { name: "Find replacements" }).click();
  expect((await req).postDataJSON().editTarget.text).toBe("putting on airs");
  await expect(page.locator(".ingredients")).toContainText("cannot guarantee");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
});
test("model comparison saves independent candidates with provenance without applying them", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "larping");
  await page
    .getByLabel("Lexical direction", { exact: true })
    .fill("Describe fake status.");
  await models(page);
  await page
    .locator(".model-controls-body")
    .getByText("Compare models", { exact: true })
    .click();
  await page
    .getByLabel("Offline conservative · Offline", { exact: true })
    .check();
  await page.getByLabel("Offline plain · Offline", { exact: true }).check();
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/ai/compare"));
  await page.getByRole("button", { name: "Compare selected models" }).click();
  expect((await sent).postDataJSON().models).toEqual([conservative, plain]);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await save(page);
  const data = await stored(request, doc.id);
  expect(documentText(data)).toBe(documentText(doc));
  expect(data.sections[0].workbench.runs).toHaveLength(2);
  expect(data.sections[0].variants).toHaveLength(4);
  expect(
    new Set(data.sections[0].variants.map((v: any) => v.model.modelId)),
  ).toEqual(new Set(["plain", "conservative"]));
  await page.locator(".local-history > summary").click();
  await page.getByText("Compare recent outputs", { exact: true }).click();
  await expect(page.locator(".run-comparison article")).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/model-comparison.png",
    fullPage: true,
  });
});
test("a delayed Hook response belongs to Hook even after focusing Segue", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Hook");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Hook-only question.");
  let release!: () => void, seen!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (seen = r));
  await page.route("**/api/ai", async (route) => {
    seen();
    await gate;
    await route.continue();
  });
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await arrived;
  await section(page, "Segue");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Independent Segue draft.");
  release();
  await expect(
    page.getByRole("button", { name: /Diagnose this/ }),
  ).toBeEnabled();
  await expect(page.locator(".response")).toHaveCount(0);
  await section(page, "Hook");
  await expect(page.locator(".diagnosis")).toContainText("OFFLINE");
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Hook-only question.",
  );
  await save(page);
  const data = await stored(request, doc.id);
  expect(data.sections[1].workbench.runs).toHaveLength(0);
  expect(data.sections[0].workbench.runs).toHaveLength(1);
  expect(documentText(data)).toBe(documentText(doc));
});
test("provider settings are honest, searchable, and manual model IDs need no rebuild", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "AI providers", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Not implemented");
  await expect(
    dialog.getByRole("heading", { name: "OpenRouter", exact: true }),
  ).toBeVisible();
  await expect(dialog.locator("input[type=password]")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Test connection · Offline", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Offline");
  const card = dialog.locator(".provider-card").filter({
    has: page.getByRole("heading", { name: "OpenAI Direct", exact: true }),
  });
  await card.getByText("Enter model ID manually", { exact: true }).click();
  await card
    .getByLabel("Manual model ID · OpenAI Direct")
    .fill("future-model-test-fixture");
  await card.getByRole("button", { name: "Add model ID" }).click();
  await expect(card.getByRole("status")).toContainText("Updated");
  const catalog = await (await request.get("/api/providers")).json();
  expect(
    catalog.providers
      .find((p: any) => p.id === "openai")
      .models.some((m: any) => m.id === "future-model-test-fixture"),
  ).toBe(true);
  await dialog.getByLabel("Search document default model").fill("plain");
  await expect(
    dialog
      .getByLabel("Document default model", { exact: true })
      .locator("option"),
  ).toHaveCount(2);
  await page.screenshot({
    path: "artifacts/provider-settings.png",
    fullPage: true,
  });
});

test("imported workbench candidates retain linked history and safe local acceptance", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "larping");
  await replacements(page);
  await save(page);
  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Document title")).toHaveValue(
    "Language objects — copy",
  );
  const id = await page.getByLabel("Switch document").inputValue();
  await section(page, "Hook");
  await expect(page.getByTestId("proposal").first()).toBeVisible();
  await page.getByTestId("accept-proposal").first().click();
  await save(page);
  const copy = await stored(request, id);
  expect(copy.history[0].state).toBe("accepted");
  expect(copy.sections[0].workbench.runs[0].response.proposals[0].id).toBe(
    copy.history[0].id,
  );
  expect(copy.sections[0].workbench.runs[0].target.documentId).toBe(copy.id);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
test("Word Lens dark mode stays readable and canonical preview remains distinct at desktop width", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await select(page, "larping");
  await page
    .getByLabel("Lexical direction", { exact: true })
    .fill("Keep the cutting implication, not internet slang.");
  await replacements(page);
  await page.getByRole("button", { name: "Toggle color theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("proposal").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/word-lens-dark.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.body.scrollWidth <= innerWidth),
  ).toBe(true);
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});

test("Ask about candidate stays attached to its original word when the cursor moves", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await select(page, "larping");
  await replacements(page);
  await select(page, "ass");
  const pending = page.waitForRequest((r) => r.url().endsWith("/api/ai"));
  await page
    .getByRole("button", { name: "Ask about candidate", exact: true })
    .first()
    .click();
  const req = (await pending).postDataJSON();
  expect(req.editTarget.text).toBe("larping");
  expect(req.lens.mode).toBe("explore");
  expect(req.instruction).toContain("posturing");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await save(page);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
});
