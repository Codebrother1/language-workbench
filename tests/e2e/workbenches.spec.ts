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
  emptyWorkbench,
  documentText,
  sectionText,
  targetFor,
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
  await expect(page.getByLabel("Run with", { exact: true })).toHaveValue(
    modelKey(plain),
  );
  await expect(page.getByLabel("Section model", { exact: true })).toHaveValue(
    modelKey(conservative),
  );
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText(
    "Offline conservative",
  );
  await expect(page.getByLabel("Run with", { exact: true })).toHaveValue("");
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
test("an Offline Run with choice stays attached to Diagnose and Propose without paid fallback", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Hook");
  await models(page);
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(modelKey(plain));
  const calls: any[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai")) calls.push(r.postDataJSON());
  });
  await diagnose(page);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await save(page);
  await page.reload();
  await section(page, "Hook");
  await page
    .getByLabel("Your material")
    .fill("Material: This is a human supplied line.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect.poll(() => calls.length).toBe(2);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  expect(calls.map((call) => call.modelOverride)).toEqual([plain, plain]);
  await save(page);
  expect(
    (await stored(request, doc.id)).sections[0].workbench.runs.map(
      (run: any) => run.model,
    ),
  ).toEqual([plain, plain]);
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
  await models(page);
  await page.locator(".model-controls details > summary").click();
  await page.getByRole("checkbox", { name: /Offline plain/ }).check();
  await page.getByRole("checkbox", { name: /Offline conservative/ }).check();
  const comparison = page.waitForRequest((r) =>
    r.url().endsWith("/api/ai/compare"),
  );
  await page.getByRole("button", { name: "Compare selected models" }).click();
  expect((await comparison).postDataJSON().models).toEqual([
    plain,
    conservative,
  ]);
  await expect(page.getByTestId("run-model")).toContainText(
    "Offline conservative",
  );
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect.poll(() => calls.length).toBe(3);
  expect(calls[2].modelOverride).toEqual(plain);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(modelKey(conservative));
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect.poll(() => calls.length).toBe(4);
  expect(calls[3].modelOverride).toEqual(conservative);
  await expect(page.getByTestId("run-model")).toContainText(
    "Offline conservative",
  );
  await page.locator(".local-history > summary").click();
  await page.getByRole("button", { name: "Inspect this run" }).last().click();
  await page.getByLabel("Your material").fill("Material: My own words again.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect.poll(() => calls.length).toBe(5);
  expect(calls[4].modelOverride).toEqual(plain);
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await page.getByLabel("Run with", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect.poll(() => calls.length).toBe(6);
  expect(calls[5].modelOverride).toBeNull();
});

test("an unavailable pinned Offline capability blocks follow-up rather than falling back", async ({
  page,
  request,
}) => {
  await seed(request);
  await open(page);
  await section(page, "Hook");
  await models(page);
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(modelKey(plain));
  const calls: any[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/ai")) calls.push(r.postDataJSON());
  });
  await diagnose(page);
  const catalog = await (await request.get("/api/providers")).json();
  catalog.providers
    .find((p: any) => p.id === "mock")
    .models.find((m: any) => m.id === "plain").capabilities.structuredOutput =
    false;
  await page.route("**/api/providers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(catalog),
    }),
  );
  await page.getByLabel("Your material").fill("Material: Human writing only.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "cannot return structured writing results",
  );
  expect(calls).toHaveLength(1);
  expect(calls[0].modelOverride).toEqual(plain);
});

test("Segue comparison separates saved original, current prose and one take per wording", async ({
  page,
  request,
}) => {
  const imported = await seed(request);
  const doc = await stored(request, imported.id);
  const segue = doc.sections[1];
  const original = targetFor(doc, segue.id);
  segue.content = newSection("Segue", "Current bridge in the draft.").content;
  const current = targetFor(doc, segue.id);
  segue.variants = [
    {
      id: "original-bridge",
      label: "Earlier bridge",
      text: original.text,
      target: current,
      sourceTarget: original,
      origin: "original",
      createdAt: doc.updatedAt,
    },
    {
      id: "plain-take",
      label: "A saved take",
      text: "A different bridge.",
      target: original,
      origin: "ai",
      model: plain,
      createdAt: doc.updatedAt,
    },
    {
      id: "conservative-take",
      label: "Another saved take",
      text: "A different bridge.",
      target: original,
      origin: "ai",
      model: conservative,
      createdAt: doc.updatedAt,
    },
  ];
  await request.put(`/api/documents/${doc.id}`, { data: doc });
  await open(page);
  await section(page, "Segue");
  await page.getByRole("button", { name: "Compare Segue versions" }).click();
  const compare = page.getByRole("dialog", { name: "Compare this connection" });
  await expect(compare.getByTestId("compare-original")).toContainText(
    original.text,
  );
  await expect(compare.getByTestId("compare-canonical")).toContainText(
    "Current bridge in the draft.",
  );
  await expect(compare.getByTestId("compare-version")).toHaveCount(1);
  await expect(compare.getByTestId("compare-version")).toContainText(
    "Offline plain",
  );
  await expect(compare.getByTestId("compare-version")).toContainText(
    "Offline conservative",
  );
  await page.reload();
  await section(page, "Segue");
  await page.getByRole("button", { name: "Compare Segue versions" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Compare this connection" })
      .getByTestId("compare-version"),
  ).toHaveCount(1);
});

test("delayed model work shows honest progress and clears it after success or error", async ({
  page,
  request,
}) => {
  await seed(request);
  let calls = 0,
    fail = false;
  await page.route("**/api/ai", async (route) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Provider unavailable" }),
      });
    const propose = route.request().postDataJSON().stage === "propose";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "mock",
        diagnosis: "Synthetic analysis",
        mechanism: "Local target only",
        question: "What should stay?",
        missingIngredients: [],
        findings: [],
        lexical: [],
        proposals: propose
          ? [
              {
                id: "p",
                label: "Synthetic",
                text: "Human supplied wording.",
                explanation: "No automatic change.",
              },
            ]
          : [],
      }),
    });
  });
  await open(page);
  await section(page, "Hook");
  await models(page);
  await expect(
    page
      .getByLabel("Section model", { exact: true })
      .locator('option[value=""]'),
  ).toHaveText("Use default model");
  await expect(
    page.getByLabel("Run with", { exact: true }).locator('option[value=""]'),
  ).toHaveText("Use default model");
  await page
    .getByLabel("Section model", { exact: true })
    .selectOption(modelKey(conservative));
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(modelKey(plain));
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.getByTestId("model-progress")).toContainText("Analyzing…");
  await expect(page.getByTestId("model-progress")).toContainText(
    "Offline plain",
  );
  await expect(page.getByTestId("section-default")).toContainText(
    "Offline conservative",
  );
  await expect(page.getByTestId("active-route")).toContainText(
    "Running with: Offline plain",
  );
  await expect(page.locator(".diagnosis")).toContainText("Synthetic analysis");
  await expect(page.getByTestId("run-model")).toContainText("Offline plain");
  await expect(page.getByTestId("model-progress")).toHaveCount(0);
  await page
    .getByLabel("Your material")
    .fill("Material: Human supplied wording.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("model-progress")).toContainText("Proposing…");
  await expect(page.getByRole("button", { name: "Proposing…" })).toBeDisabled();
  await expect(page.getByTestId("proposal")).toHaveCount(1);
  await expect(page.getByTestId("model-progress")).toHaveCount(0);
  expect(calls).toBe(2);
  fail = true;
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("model-progress")).toContainText("Proposing…");
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
  await expect(page.getByTestId("model-progress")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Propose options" }),
  ).toBeEnabled();
  expect(calls).toBe(3);
});

test("zero-result reasons and genuinely empty results are visible without invented proposals", async ({
  page,
  request,
}) => {
  await seed(request);
  let empty = false,
    unsupported = false,
    fail = false;
  await page.route("**/api/ai", (route) => {
    if (fail)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Provider unavailable" }),
      });
    const propose = route.request().postDataJSON().stage === "propose";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "mock",
        diagnosis: propose ? "" : "Diagnosis",
        mechanism: "",
        question: propose ? "" : "What stays?",
        missingIngredients: propose
          ? unsupported
            ? ["This provider cannot produce this result."]
            : empty
              ? []
              : ["No safe offline proposal: A protected quote was changed."]
          : [],
        findings: [],
        lexical: [],
        proposals: [],
      }),
    });
  });
  await open(page);
  await section(page, "Hook");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText("Diagnosis");
  await page
    .getByLabel("Your material")
    .fill("Material: Human supplied words.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("result-outcome")).toContainText(
    "No safe result",
  );
  await expect(page.getByTestId("result-outcome")).toContainText(
    "The generated option changed a protected quote",
  );
  await page.getByRole("button", { name: "Copy all AI output" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("The generated option changed a protected quote");
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await save(page);
  await page.reload();
  await section(page, "Hook");
  await expect(page.getByTestId("result-outcome")).toContainText(
    "The generated option changed a protected quote",
  );
  empty = true;
  await page.getByLabel("Your material").fill("Material: Another human line.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("result-outcome")).toContainText(
    "No result returned",
  );
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  unsupported = true;
  await page.getByLabel("Your material").fill("Material: A third line.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("result-outcome")).toContainText(
    "Unavailable for this provider",
  );
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  fail = true;
  await page.getByLabel("Your material").fill("Material: A fourth line.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByRole("alert")).toContainText("Provider unavailable");
});

test("distinct saved Lab questions keep separate follow-up answers", async ({
  page,
  request,
}) => {
  await seed(request);
  await page.route("**/api/ai", (route) => {
    const propose = route.request().postDataJSON().stage === "propose";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        provider: "mock",
        diagnosis: propose ? "Second diagnosis" : "First diagnosis",
        mechanism: "",
        question: propose
          ? "What changed in the second pass?"
          : "What matters in the first pass?",
        missingIngredients: [],
        findings: [],
        lexical: [],
        proposals: propose
          ? [
              {
                id: "p",
                label: "Option",
                text: "A human option.",
                explanation: "Only a preview.",
              },
            ]
          : [],
      }),
    });
  });
  await open(page);
  await section(page, "Hook");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText("First diagnosis");
  await page.getByLabel("Your material").fill("My first answer.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByLabel("Your material")).toHaveValue("");
  await page.locator(".local-history > summary").click();
  await page.getByRole("button", { name: "Inspect this run" }).last().click();
  await expect(page.getByLabel("Your material")).toHaveValue(
    "My first answer.",
  );
  await page.getByRole("button", { name: "Inspect this run" }).first().click();
  await expect(page.getByLabel("Your material")).toHaveValue("");
  await page.getByLabel("Your material").fill("My second answer.");
  await save(page);
  await page.reload();
  await section(page, "Hook");
  await page.locator(".local-history > summary").click();
  await page.getByRole("button", { name: "Inspect this run" }).last().click();
  await expect(page.getByLabel("Your material")).toHaveValue(
    "My first answer.",
  );
  await page.getByRole("button", { name: "Inspect this run" }).first().click();
  await expect(page.getByLabel("Your material")).toHaveValue(
    "My second answer.",
  );
});

test("common Lab approaches name the action without changing the selected prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  await section(page, "Hook");
  await expect(
    page.getByRole("button", { name: "Diagnose this section" }),
  ).toBeVisible();
  await page
    .getByLabel("Writing action", { exact: true })
    .selectOption("humor");
  await expect(page.getByRole("button", { name: "Try humor" })).toBeVisible();
  await page.locator(".all-actions > summary").click();
  await page.getByLabel("All writing actions").selectOption("register");
  await expect(
    page.getByRole("button", { name: "Explore register" }),
  ).toBeVisible();
  expect(documentText(await stored(request, doc.id))).toBe(documentText(doc));
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
  await expect(page.getByTestId("result-outcome")).toContainText(
    "cannot guarantee",
  );
  await expect(page.getByTestId("result-outcome")).toContainText(
    "Unavailable for this provider",
  );
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
  const offline = dialog.locator(".provider-card").filter({
    has: page.getByRole("heading", { name: "Offline", exact: true }),
  });
  await expect(offline.locator(".tag")).toContainText([
    "Enabled",
    "Configured",
  ]);
  await offline.getByRole("button", { name: "Disable Offline" }).click();
  await expect(offline.locator(".tag")).toContainText([
    "Disabled",
    "Configured",
  ]);
  await expect(offline.getByRole("status")).toHaveText("Offline disabled");
  await offline.getByRole("button", { name: "Enable Offline" }).click();
  await expect(offline.locator(".tag")).toContainText([
    "Enabled",
    "Configured",
  ]);
  await expect(offline.getByRole("status")).toHaveText("Offline enabled");
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

test("Delivery Lens explains exact punctuation without changing canonical sections", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument("Delivery lines", "Dre, please.");
  doc.sections.push(
    newSection(
      "Freeform",
      "I knew it was fake — and that was almost the point.",
    ),
  );
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  await open(page);
  await select(page, "Dre, please.");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Delivery Lens" }),
  ).toBeVisible();
  await page.getByLabel("Delivery question").fill("What if this ended louder?");
  await page.getByRole("button", { name: "Explore delivery" }).click();
  await expect(page.getByTestId("delivery-result")).toContainText(
    /deadpan|final/i,
  );
  await expect(page.getByTestId("delivery-result")).toContainText(
    "Dre, please!",
  );
  await expect(page.getByTestId("proposal")).toHaveCount(0);
  await select(page, "I knew it was fake — and that was almost the point.");
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByRole("button", { name: "Explore delivery" }).click();
  await expect(page.getByTestId("delivery-result")).toContainText(
    /pivot|turn/i,
  );
  await save(page);
  expect(documentText(await stored(request, imported.id))).toBe(
    documentText(imported),
  );
});

test("quoted-turn target stays distinct from a sentence and remains historical after an edit", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument(
    "Dialogue turns",
    '"Yeah. I\'m good." Another voice said "Sure."',
  );
  doc.sections.push(
    newSection(
      "Freeform",
      'She said, "No—nothing bad. Just call." Then “Wait. Really?”',
    ),
  );
  doc.sections.push(newSection("Freeform", 'She said, "Unfinished dialogue.'));
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const [first, second, third] = imported.sections.map(
    (s: { id: string }) => s.id,
  );
  const caret = async (id: string, word: string) =>
    page.getByTestId("writing-editor").evaluate(
      (root, { id, word }) => {
        const section = Array.from(root.children).find(
          (node) => (node as HTMLElement).id === id,
        )!;
        const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const index = (node.textContent ?? "").indexOf(word);
          if (index < 0) continue;
          window
            .getSelection()
            ?.setBaseAndExtent(node, index + 2, node, index + 2);
          (root as HTMLElement).focus();
          document.dispatchEvent(new Event("selectionchange"));
          return;
        }
        throw new Error("Missing dialogue word");
      },
      { id, word },
    );
  await open(page);
  await caret(first, "good");
  await expect(page.locator(".target-box")).toContainText("I'm good.");
  await expect(page.locator(".target-box")).not.toContainText("Yeah.");
  await page.getByRole("button", { name: "Quoted turn" }).click();
  await expect(page.locator(".target-box")).toContainText('"Yeah. I\'m good."');
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByRole("button", { name: "Explore delivery" }).click();
  await expect(page.getByTestId("delivery-result")).toBeVisible();
  await save(page);
  let storedDoc = await stored(request, imported.id);
  expect(storedDoc.sections[0].workbench.runs[0].target).toMatchObject({
    unit: "quoted_turn",
    text: '"Yeah. I\'m good."',
    sectionId: first,
  });
  await page.reload();
  await expect(page.locator(".target-box")).toContainText("QUOTED TURN");
  await page.locator(".local-history > summary").click();
  await expect(page.locator(".local-history .run-entry")).toContainText(
    "Quoted turn",
  );
  await page.locator(".local-history > summary").click();
  await select(page, "Yeah.");
  await page.keyboard.insertText("Nope.");
  await save(page);
  await page.locator(`[data-section-id="${second}"] .section-focus`).click();
  await caret(second, "Just call");
  await page.getByRole("button", { name: "Quoted turn" }).click();
  await expect(page.locator(".target-box")).toContainText(
    '"No—nothing bad. Just call."',
  );
  await expect(page.locator(".target-box")).not.toContainText("She said,");
  await caret(second, "Really");
  await page.getByRole("button", { name: "Quoted turn" }).click();
  await expect(page.locator(".target-box")).toContainText("“Wait. Really?”");
  await caret(third, "Unfinished");
  await expect(page.getByRole("button", { name: "Quoted turn" })).toHaveCount(
    0,
  );
  await page.locator(`[data-section-id="${first}"] .section-focus`).click();
  await page.locator(".local-history > summary").click();
  await page.getByRole("button", { name: "Inspect this run" }).click();
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(page.locator(".response-original")).toContainText(
    '"Yeah. I\'m good."',
  );
  await expect(page.locator(".response-original .eyebrow")).toContainText(
    "Original quoted turn",
  );
  await expect(page.getByTestId("target-resolution")).toContainText(
    "Target changed since this run",
  );
  await page.getByRole("button", { name: "Return to current passage" }).click();
  await expect(page.locator(".target-box")).toContainText("QUOTED TURN");
  expect(
    (
      await page.locator(`[id="${first}"] .target-highlight`).allTextContents()
    ).join(" "),
  ).not.toContain("Sure");
  storedDoc = await stored(request, imported.id);
  expect(documentText(storedDoc)).toContain('"Nope. I\'m good."');
});

test("incidental caret typing does not persist a phantom selected passage", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument(
    "Cursor is not a selection",
    "A beginning. Another sentence.",
  );
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  await open(page);
  await page.locator(`[id="${imported.sections[0].id}"] p`).click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" Added without selecting.");
  await save(page);
  expect((await stored(request, imported.id)).focusTarget).toBeNull();
  await page.reload();
  await expect(page.locator(".target-box")).not.toContainText(
    "SELECTED PASSAGE",
  );
  await select(page, "beginning");
  await save(page);
  expect((await stored(request, imported.id)).focusTarget).toMatchObject({
    scope: "word",
    unit: "selection",
    text: "beginning",
  });
  await page.reload();
  await expect(page.locator(".target-box")).toContainText("SELECTED WORD");
  const legacy = await stored(request, imported.id);
  const end = sectionText(legacy.sections[0]).indexOf(".") + 1;
  legacy.focusTarget = {
    ...targetFor(legacy, legacy.sections[0].id, "selection", 0, end),
    unit: "sentence",
  };
  await request.put(`/api/documents/${legacy.id}`, { data: legacy });
  await page.reload();
  await expect(page.locator(".target-box")).toContainText("WHOLE SECTION");
});

test("shared-piece quality notes and a requested revision question remain review-only", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument(
    "Shared piece",
    "The refrigerator light pooled on the floor.",
  );
  doc.sections.push(newSection("Segue", "The light stayed on."));
  doc.sections.push(
    newSection("Point", "The repair bill meant we could not keep the house."),
  );
  doc.workbench = {
    ...emptyWorkbench(),
    instruction: "Give me one revision question.",
  };
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  await page.route("**/api/ai", (route) => {
    const input = route.request().postDataJSON();
    const base = {
      provider: "openai",
      diagnosis: "The image and the bill carry different weights.",
      mechanism: "Move from the light toward consequence.",
      question: "Which image should carry forward?",
      missingIngredients: [],
      findings: [],
      lexical: [],
      proposals: [],
    };
    return route.fulfill({
      json:
        input.action === "critique"
          ? { ...base, question: "Which repeated light image should you cut?" }
          : input.stage === "propose"
            ? {
                ...base,
                qualityNotices: ["Repeats the next section."],
                proposals: [
                  {
                    id: "pivot",
                    label: "Pivot",
                    text: "The refrigerator hummed after the voices stopped.",
                    explanation: "Carries the image without naming the bill.",
                    qualityNote: "Preserves the refrigerator image.",
                  },
                ],
              }
            : base,
    });
  });
  await open(page);
  await section(page, "Segue");
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("One short bridge.");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await page
    .getByLabel("Your material", { exact: true })
    .fill("Material: The light outlasted us.");
  await page.getByRole("button", { name: "Propose options" }).click();
  await expect(page.getByTestId("proposal")).toHaveCount(1);
  await expect(page.getByTestId("quality-note")).toContainText(
    "refrigerator image",
  );
  await expect(page.locator(".quality-notices")).toContainText(
    "Repeats the next section",
  );
  await page.getByRole("button", { name: "Whole-piece critique" }).click();
  await expect(page.getByTestId("revision-question")).toContainText(
    "Which repeated light image should you cut?",
  );
  await save(page);
  expect(documentText(await stored(request, imported.id))).toBe(
    documentText(imported),
  );
});

test("nine-section navigation resolves findings, names cards and layers Phrase Lens context", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument("Nine rooms", "The kettle ticked. We kept waiting.");
  for (let i = 1; i < 9; i++)
    doc.sections.push(
      newSection("Freeform", `Draft thought ${i + 1} returns to the decision.`),
    );
  doc.sections[1].label = "What waiting did";
  doc.sections[2].content = newSection(
    "Freeform",
    "The list starts lying. We decide later.",
  ).content;
  doc.sections[7].label = "The callback";
  doc.sections[2].workbench = {
    ...emptyWorkbench(),
    instruction: "Keep this local.",
  };
  doc.workbench = {
    ...emptyWorkbench(),
    instruction: "Where is repetition hurting this?",
  };
  doc.parkedGroups = [
    { id: "side-roads", name: "Side roads", collapsed: false },
  ];
  const ungrouped = newSection("Freeform", "A loose thought stays parked.");
  ungrouped.placement = "parked";
  const grouped = newSection("Freeform", "A side road stays nearby.");
  grouped.placement = "parked";
  grouped.parkedGroupId = "side-roads";
  doc.sections.push(ungrouped, grouped);
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const ids: string[] = imported.sections.map((s: { id: string }) => s.id);
  const unknown = "00000000-0000-4000-8000-000000000000";
  await page.route("**/api/ai", (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      json: {
        provider: "openai",
        diagnosis: input.lens
          ? "Here, decide later suspends a choice rather than resolving it. ".repeat(
              13,
            ) + `Elsewhere ${ids[6]} echoes the delay.`
          : `Repetition gathers around ${ids[1]} and ${ids[2]}.`,
        mechanism:
          "The wording recurs across the piece without changing the selected phrase.",
        question: "What should the reader know at this point?",
        missingIngredients: [],
        proposals: [],
        lexical: [],
        findings: input.lens
          ? [ids[5], ids[6], ids[7]].map((id) => ({
              sectionId: id,
              title: "An echo elsewhere",
              detail: `Related use in ${id}.`,
              severity: "consider",
            }))
          : [
              {
                sectionId: ids[7],
                title: "Sections 2 and 3 repeat the decision-delay move.",
                detail: `The callback at ${ids[7]} returns. ${unknown} is not a known section.`,
                severity: "consider",
              },
            ],
      },
    });
  });
  await open(page);
  await expect(page.getByLabel("Document title")).toHaveValue("Nine rooms");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByTestId("structure-item")).toHaveCount(11);
  const third = page.locator(`[data-section-id="${ids[2]}"]`);
  await third.getByRole("button", { name: "Name section 3" }).click();
  await page
    .getByLabel("Short label for section 3")
    .fill("The list starts lying");
  await page.getByLabel("Short label for section 3").press("Enter");
  await expect(third.locator(".section-focus")).toContainText(
    "The list starts lying",
  );
  await expect(third.locator(".section-role")).toContainText("Freeform");
  const fourth = page.locator(`[data-section-id="${ids[3]}"]`);
  await fourth.getByRole("button", { name: "Name section 4" }).click();
  await page.getByLabel("Short label for section 4").fill("Not saved");
  await page.getByLabel("Short label for section 4").press("Escape");
  await expect(fourth.locator(".section-focus")).not.toContainText("Not saved");
  await page.getByRole("button", { name: "Collapse Side roads" }).click();
  await expect(page.locator(`[data-section-id="${ids[10]}"]`)).toBeHidden();
  await expect(page.locator(`[data-section-id="${ids[9]}"]`)).toBeVisible();
  await save(page);
  await page.reload();
  await expect(page.locator(`[data-section-id="${ids[10]}"]`)).toBeHidden();
  await page.getByRole("button", { name: "Expand Side roads" }).press("Enter");
  await expect(page.locator(`[data-section-id="${ids[10]}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Whole-piece critique" }).click();
  await expect(page.locator(".finding")).toHaveCount(1);
  const visible = await page.locator(".inspector").innerText();
  for (const id of [ids[1], ids[2], ids[7]]) expect(visible).not.toContain(id);
  expect(visible).toContain(unknown);
  const finding = page.locator(".finding").first();
  await expect(finding.locator(".finding-references .button")).toHaveCount(3);
  await finding
    .locator(".finding-references .button")
    .filter({ hasText: "What waiting did" })
    .click();
  await expect(page.locator(`[data-section-id="${ids[1]}"]`)).toHaveClass(
    /active/,
  );
  await page.getByRole("button", { name: "Whole-piece critique" }).click();
  await page
    .locator(".finding-references .button")
    .filter({ hasText: "The list starts lying" })
    .click();
  await expect(third).toHaveClass(/active/);
  await select(page, "decide later");
  await page.getByRole("button", { name: "Diagnose this phrase" }).click();
  await expect(page.locator(".diagnosis")).toContainText("suspends a choice");
  expect((await page.locator(".diagnosis").innerText()).length).toBeLessThan(
    350,
  );
  await expect(page.locator(".lens-more-analysis > summary")).toBeVisible();
  await expect(page.locator(".related-draft-uses > summary")).toContainText(
    "(3)",
  );
  await page.locator(".related-draft-uses > summary").click();
  await expect(page.locator(".related-draft-uses .finding")).toHaveCount(3);
  await page
    .locator(".related-draft-uses .finding-references .button")
    .filter({ hasText: "The callback" })
    .first()
    .click();
  await expect(page.locator(`[data-section-id="${ids[7]}"]`)).toHaveClass(
    /active/,
  );
  await third.locator(".section-focus").click();
  await third.locator(".section-options summary").click();
  await third.getByRole("button", { name: "Move section up" }).click();
  await save(page);
  const after = await stored(request, imported.id);
  expect(after.sections[1].id).toBe(ids[2]);
  expect(after.sections[1].label).toBe("The list starts lying");
  expect(sectionText(after.sections[1])).toContain("decide later");
  expect(after.sections[1].workbench.instruction).toBe("Keep this local.");
  expect(after.sections[10].parkedGroupId).toBe("side-roads");
});

test("finding edit return restores the same critique and explicitly analyzes the revised draft", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument("Revision loop", "An opening stays.");
  for (let i = 1; i < 8; i++)
    doc.sections.push(
      newSection("Freeform", `Section ${i + 1} continues the thought.`),
    );
  doc.sections[4].label = "The earlier delay";
  doc.sections[7].label = "What waiting did";
  doc.sections[7].content = newSection(
    "Freeform",
    "Sentence to cut. Keep this line.",
  ).content;
  doc.workbench = {
    ...emptyWorkbench(),
    instruction: "Where is repetition hurting this?",
  };
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const ids: string[] = imported.sections.map((s: { id: string }) => s.id);
  let calls = 0;
  await page.route("**/api/ai", (route) => {
    calls++;
    return route.fulfill({
      json: {
        provider: "mock",
        diagnosis: "Repetition between sections 5 and 8 weakens the delay.",
        mechanism: "The recurrence is visible in the draft.",
        question: "Which delay still earns its space?",
        missingIngredients: [],
        proposals: [],
        lexical: [],
        findings: [
          {
            sectionId: ids[7],
            title:
              calls === 1
                ? "Sections 5 and 8 repeat the same move."
                : "The revision leaves one useful delay.",
            detail: `Compare ${ids[4]} with ${ids[7]}.`,
            severity: "consider",
          },
        ],
      },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Whole-piece critique" }).click();
  await expect(page.locator(".finding")).toContainText(
    "The earlier delay and What waiting did repeat",
  );
  await expect(page.getByTestId("analysis-state")).toHaveText("Current draft");
  await page
    .locator(".finding-references .button")
    .filter({ hasText: "What waiting did" })
    .click();
  await expect(page.locator(`[data-section-id="${ids[7]}"]`)).toHaveClass(
    /active/,
  );
  await expect(
    page.getByRole("button", { name: /Return to finding/ }),
  ).toBeVisible();
  await select(page, "Sentence to cut.");
  await page.keyboard.press("Backspace");
  await expect(page.getByTestId("finding-return")).toContainText(
    "Based on an earlier draft",
  );
  await save(page);
  expect(
    sectionText((await stored(request, imported.id)).sections[7]),
  ).not.toContain("Sentence to cut.");
  await page.getByRole("button", { name: /Return to finding/ }).click();
  await expect(page.locator(".finding")).toContainText(
    "The earlier delay and What waiting did repeat",
  );
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  await expect(page.locator(".finding-references .button")).toHaveCount(2);
  expect(calls).toBe(1);
  await save(page);
  await page.reload();
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await expect(page.getByTestId("analysis-state")).toHaveText(
    "Based on an earlier draft",
  );
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Analyze revised draft" }).click();
  await expect(page.locator(".finding")).toContainText(
    "The revision leaves one useful delay",
  );
  await expect(page.getByTestId("analysis-state")).toHaveText("Current draft");
  expect(calls).toBe(2);
  await page.locator(".local-history > summary").click();
  await expect(page.locator(".local-history .run-entry")).toHaveCount(2);
  await expect(page.locator(".local-history .run-entry").first()).toContainText(
    "Current draft",
  );
  await expect(page.locator(".local-history .run-entry").last()).toContainText(
    "Earlier draft",
  );
  await save(page);
  await page.reload();
  await page.getByRole("button", { name: /Review saved critique/ }).click();
  await page.locator(".local-history > summary").click();
  await expect(page.locator(".local-history .run-entry").last()).toContainText(
    "Earlier draft",
  );
  expect(calls).toBe(2);
  expect(
    sectionText((await stored(request, imported.id)).sections[7]),
  ).not.toContain("Sentence to cut.");
});

test("saved sentence run never highlights another sentence after its target is replaced", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const doc = newDocument("Historical sentence", "Start with the first room.");
  for (let i = 1; i < 8; i++)
    doc.sections.push(newSection("Freeform", `Room ${i + 1} stays here.`));
  doc.sections[7].label = "Ending";
  const before = "Before stayed stable. ";
  const original = "Sentence A carried the point.";
  const replacement = "Sentence B now carries the point.";
  const after = " After stayed stable. Unrelated C should never be the target.";
  doc.sections[7].content = newSection(
    "Freeform",
    before + original + after,
  ).content;
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  const id = imported.sections[7].id;
  let requests = 0;
  await page.route("**/api/ai", (route) => {
    requests++;
    return route.fulfill({
      json: {
        provider: "mock",
        diagnosis: "The original sentence holds the point.",
        mechanism: "It delays the next image.",
        question: "What should change?",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
    });
  });
  await open(page);
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await select(page, original);
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Diagnose this exact sentence.");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".response-original")).toContainText(original);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Return to selection" }).click();
  await select(page, original);
  await page.keyboard.insertText(replacement);
  await save(page);
  await page
    .locator(`[data-section-id="${imported.sections[6].id}"] .section-focus`)
    .click();
  await page.locator(`[data-section-id="${id}"] .section-focus`).click();
  await page.locator(".local-history > summary").click();
  await page.getByRole("button", { name: "Inspect this run" }).click();
  await expect(page.locator(".response-original")).toContainText(original);
  await expect(page.getByTestId("target-resolution")).toContainText(
    "Target changed since this run",
  );
  await expect(page.getByTestId("target-resolution")).toContainText(
    replacement,
  );
  await expect(
    page.getByRole("button", { name: "Return to selection" }),
  ).toHaveCount(0);
  await expect(page.locator(".local-history .run-entry")).not.toContainText(
    "Earlier section",
  );
  await expect(page.locator(`[id="${id}"] .target-highlight`)).toHaveCount(0);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  expect(requests).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Select a new target");
  await expect(page.getByTestId("lab-return")).toBeVisible();
  await page.getByTestId("lab-return").getByRole("button").click();
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(page.locator(".response-original")).toContainText(original);
  await page.getByRole("button", { name: "Return to current passage" }).click();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
  expect(requests).toBe(1);
  await page.locator(".revision-trail > summary").click();
  await page.locator(".revision-trail li .button").last().click();
  await expect(page.locator(`[data-section-id="${id}"]`)).toHaveClass(/active/);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: /Open saved run/ }).click();
  await expect(page.locator(".response-original")).toContainText(original);
  await page.getByRole("button", { name: /Use current passage/ }).click();
  await expect(page.getByTestId("target-resolution")).toContainText(
    "Current passage selected",
  );
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect.poll(() => requests).toBe(2);
  await save(page);
  expect(
    sectionText((await stored(request, imported.id)).sections[7]),
  ).toContain(replacement);
  await select(page, "Before stayed stable.");
  await page.keyboard.insertText("Different opening.");
  await select(page, "After stayed stable.");
  await page.keyboard.insertText("Different ending.");
  await save(page);
  const history = page.locator(".local-history");
  if (!(await history.evaluate((node) => node.hasAttribute("open"))))
    await history.locator("> summary").click();
  await history
    .locator(".run-entry")
    .last()
    .getByRole("button", { name: "Inspect this run" })
    .click();
  await expect(page.getByTestId("target-resolution")).toContainText(
    "can’t be located reliably",
  );
  await expect(
    page.getByRole("button", { name: "Return to selection" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Return to current passage" }),
  ).toHaveCount(0);
  await expect(page.locator(`[id="${id}"] .target-highlight`)).toHaveCount(0);
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  expect(requests).toBe(2);
  await select(page, "Unrelated C should never be the target.");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect.poll(() => requests).toBe(3);
});

for (const width of [1440, 700])
  test(`Return to selection shows the exact highlighted passage at ${width}px`, async ({
    page,
    request,
  }) => {
    const doc = await seed(request);
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const calls: string[] = [];
    page.on("request", (event) => {
      if (event.url().endsWith("/api/ai")) calls.push(event.url());
    });
    await section(page, "Hook");
    await select(page, "The rest stays mine.");
    await diagnose(page);
    await expect(
      page.getByRole("button", { name: "Return to selection" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Return to selection" }).click();
    const highlight = page.locator(
      `[id="${doc.sections[0].id}"] .target-highlight`,
    );
    await expect(highlight).toContainText("The rest stays mine.");
    await expect(highlight).toBeInViewport();
    expect(calls).toHaveLength(1);
  });

test("historical Lab target status and the exact question remain oriented through reload", async ({
  page,
  request,
}) => {
  await seed(request);
  for (const item of await (await request.get("/api/documents")).json())
    await request.delete(`/api/documents/${item.id}`);
  const first = "Before stayed stable. ";
  const original = "Sentence A carried the point.";
  const changed = "Sentence B now carries the point.";
  const last = " After stayed stable. Unrelated C remains here.";
  const doc = newDocument("Historical selection", first + original + last);
  doc.sections.push(newSection("Freeform", "A neighboring section to visit."));
  const imported = await (
    await request.post("/api/import", { data: { document: doc } })
  ).json();
  let calls = 0;
  await page.route("**/api/ai", (route) => {
    calls++;
    return route.fulfill({
      json: {
        provider: "mock",
        diagnosis: "The original sentence held a point.",
        mechanism: "The cadence matters.",
        question: "Which line should remain?",
        missingIngredients: [],
        findings: [],
        proposals: [],
        lexical: [],
      },
    });
  });
  await open(page);
  await select(page, original);
  await page
    .getByLabel("Your direction", { exact: true })
    .fill("Review this exact line.");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await expect(page.locator(".diagnosis")).toContainText(
    "The original sentence held a point.",
  );
  await save(page);
  const runId = (await stored(request, imported.id)).sections[0].workbench
    ?.activeRunId;
  await select(page, original);
  await page.keyboard.insertText(changed);
  await save(page);
  await page.reload();
  await expect(page.locator(".response-original")).toContainText(original);
  await expect(page.getByTestId("target-resolution")).toContainText(
    "Target changed since this run",
  );
  await expect(page.getByTestId("target-resolution")).toContainText(changed);
  await expect(
    page.locator(`[id="${imported.sections[0].id}"] .target-highlight`),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 700, height: 900 });
  await page.getByRole("button", { name: "Return to current passage" }).click();
  const mapped = page.locator(
    `[id="${imported.sections[0].id}"] .target-highlight`,
  );
  await expect(mapped).toContainText(changed);
  await expect(mapped).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(`[data-section-id="${imported.sections[1].id}"] .section-focus`)
    .click();
  await page.locator(".inspector").evaluate((pane) => {
    pane.scrollTop = 0;
  });
  await expect(page.getByTestId("lab-return")).toBeVisible();
  await page.getByTestId("lab-return").getByRole("button").click();
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  await expect(page.locator(".diagnosis")).toContainText(
    "The original sentence held a point.",
  );
  await expect(page.getByLabel("Your direction", { exact: true })).toHaveValue(
    "Review this exact line.",
  );
  await expect(page.locator(".response")).toContainText(
    "Which line should remain?",
  );
  expect(
    (await stored(request, imported.id)).sections[0].workbench.activeRunId,
  ).toBe(runId);
  expect(
    (await stored(request, imported.id)).sections[0].workbench.runs.some(
      (run: any) => run.id === runId,
    ),
  ).toBe(true);
  expect(calls).toBe(1);
  const resultInPane = await page.locator(".response").evaluate((result) => {
    const pane = result.closest(".inspector")!;
    return (
      result.getBoundingClientRect().top >= pane.getBoundingClientRect().top &&
      result.getBoundingClientRect().top <
        pane.getBoundingClientRect().bottom - 60
    );
  });
  expect(resultInPane).toBe(true);
  await select(page, "Before stayed stable.");
  await page.keyboard.insertText("Different opening.");
  await select(page, "After stayed stable.");
  await page.keyboard.insertText("Different ending.");
  await save(page);
  await page.reload();
  await expect(page.getByTestId("target-resolution")).toContainText(
    "can’t be located reliably",
  );
  await expect(
    page.locator(`[id="${imported.sections[0].id}"] .target-highlight`),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test("Return to section restores the card without acting like Return to question", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await open(page);
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await section(page, "Hook");
  await diagnose(page);
  await page
    .locator(`[data-section-id="${doc.sections[1].id}"] .section-focus`)
    .click();
  await page.getByTestId("lab-return").getByRole("button").click();
  await page
    .getByRole("button", { name: "Return to section", exact: true })
    .click();
  await expect(
    page.locator(`[data-section-id="${doc.sections[0].id}"]`),
  ).toHaveClass(/active/);
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  expect(calls).toHaveLength(1);
});

test("stacked Return to question brings its saved result into view without refocusing prose", async ({
  page,
  request,
}) => {
  const doc = await seed(request);
  await page.setViewportSize({ width: 700, height: 900 });
  await open(page);
  const calls: string[] = [];
  page.on("request", (event) => {
    if (event.url().endsWith("/api/ai")) calls.push(event.url());
  });
  await section(page, "Hook");
  await select(page, "The rest stays mine.");
  await diagnose(page);
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Delivery Lens" }),
  ).toBeVisible();
  await page
    .locator(`[data-section-id="${doc.sections[1].id}"] .section-focus`)
    .click();
  await expect(page.getByTestId("lab-return")).toBeVisible();
  await page.getByTestId("lab-return").getByRole("button").click();
  await expect(page.locator(".response")).toBeInViewport();
  await expect(page.getByTestId("saved-run-context")).toContainText(
    "Saved Lab result · coach",
  );
  await expect(page.getByTestId("writing-editor")).not.toBeFocused();
  expect(calls).toHaveLength(1);
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
