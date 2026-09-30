import { _electron } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const executablePath = resolve(
  root,
  "dist-desktop/mac-arm64/Language Workbench.app/Contents/MacOS/Language Workbench",
);
if (!existsSync(executablePath))
  throw new Error(
    `Build the desktop app before smoke testing: ${executablePath}`,
  );
const dir = mkdtempSync(join(tmpdir(), "language-workbench-desktop-smoke-"));
const devDb = join(root, "data/workbench.sqlite");
const devBefore = existsSync(devDb) ? statSync(devDb).mtimeMs : null;
const env = {
  ...process.env,
  WORKBENCH_DESKTOP_SMOKE_DIR: dir,
  OPENAI_API_KEY: "",
  ELECTRON_RUN_AS_NODE: "",
};
let desktop, page;
let success = false;
let stage = "launch";
const start = async () => {
  desktop = await _electron.launch({ executablePath, env, timeout: 30_000 });
  page = await desktop.firstWindow();
  await page.getByTestId("save-state").waitFor({ timeout: 30_000 });
  return page;
};
const api = async (base, path, method = "GET", body) => {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `${method} ${path} returned ${response.status}`);
  return response.json();
};
try {
  page = await start();
  const base = page.url().replace(/\/$/, "");
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await api(base, "/health")).provider, "mock");
  stage = "fill title";
  await page.getByLabel("Document title").fill("Disposable Desktop Smoke");
  stage = "switch Document View";
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  stage = "focus editor";
  const editor = page.getByTestId("writing-editor");
  await editor.click();
  stage = "type prose";
  await page.keyboard.insertText("Desktop prose survives. More human words.");
  stage = "wait for save";
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="save-state"]')
        ?.textContent?.trim() === "Saved",
  );
  const created = (await api(base, "/documents")).find(
    (doc) => doc.title === "Disposable Desktop Smoke",
  );
  assert.ok(
    created?.id,
    "Desktop prose was not saved in the disposable database",
  );
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.getByRole("button", { name: "Workbench", exact: true }).click();
  stage = "Add and reorder sections";
  const capture = page.getByLabel("New thought");
  await capture.fill("A second desktop section.");
  await capture.press("Enter");
  const second = page
    .getByTestId("structure-item")
    .filter({ hasText: "A second desktop section." });
  await second.locator(".section-focus").click();
  await second.locator(".section-options summary").click();
  await second.getByRole("button", { name: "Move section up" }).click();
  await page.getByTestId("save-state").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="save-state"]')
        ?.textContent?.trim() === "Saved",
  );
  assert.equal(
    (await api(base, `/documents/${created.id}`)).sections.length,
    2,
  );
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  assert.ok((await editor.innerText()).includes("More human words."));
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Piece memory", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "Revision plan", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
  const authoredBeforeCredential = await api(base, `/documents/${created.id}`);
  stage = "Lab and provider settings";
  await page.getByLabel("Writing action", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "AI providers" })
    .click();
  await page
    .getByRole("button", { name: "Open desktop data folder" })
    .waitFor();
  const credentialStatus = await page.evaluate(() =>
    window.workbenchDesktop.openAIStatus(),
  );
  assert.equal(
    credentialStatus.canStore,
    true,
    "macOS secure storage is unavailable in this build",
  );
  assert.equal(credentialStatus.configured, false);
  const syntheticKey = "sk-desktop-smoke-not-a-real-credential-12345";
  await desktop.evaluate(() => {
    const realFetch = globalThis.fetch;
    globalThis.desktopFixtureCalls = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname !== "api.openai.com") return realFetch(input, init);
      globalThis.desktopFixtureCalls.push(url.pathname);
      if (url.pathname === "/v1/models")
        return new Response(
          JSON.stringify({
            object: "list",
            data: [
              {
                id: "gpt-4.1-mini",
                object: "model",
                created: 1,
                owned_by: "openai",
              },
              {
                id: "gpt-6.1-something",
                object: "model",
                created: 1,
                owned_by: "openai",
              },
              {
                id: "gpt-5-chat-latest",
                object: "model",
                created: 1,
                owned_by: "openai",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      if (url.pathname === "/v1/responses")
        return new Response(
          JSON.stringify({
            id: "resp_desktop_smoke",
            object: "response",
            created_at: 1,
            status: "completed",
            output: [
              {
                type: "message",
                id: "msg_desktop_smoke",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      provider: "openai",
                      diagnosis: "Fixture-only diagnosis.",
                      mechanism: "",
                      question: "",
                      missingIngredients: [],
                      proposals: [],
                      findings: [],
                      lexical: [],
                    }),
                    annotations: [],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      throw new Error(
        "Only fixture OpenAI endpoints are available in disposable desktop smoke",
      );
    };
  });
  const card = page
    .getByRole("dialog")
    .locator(".provider-card")
    .filter({
      has: page.getByRole("heading", { name: "OpenAI Direct", exact: true }),
    });
  assert.equal(
    await card
      .getByRole("button", { name: "Test connection · OpenAI Direct" })
      .isDisabled(),
    true,
  );
  assert.equal(
    await card
      .getByRole("button", { name: "Refresh models · OpenAI Direct" })
      .isDisabled(),
    true,
  );
  stage = "Add desktop API key";
  await card.getByRole("button", { name: "Add API key" }).click();
  await card.getByLabel("New OpenAI API key").fill(syntheticKey);
  assert.equal(
    (await desktop.evaluate(() => globalThis.desktopFixtureCalls)).length,
    0,
  );
  await card.getByRole("button", { name: "Save API key" }).click();
  await card
    .locator(".guidance[role=status]")
    .filter({ hasText: "API key saved" })
    .waitFor();
  assert.equal(await card.locator('input[type="password"]').count(), 0);
  assert.ok(
    !(await page.getByRole("dialog").innerText()).includes(syntheticKey),
  );
  assert.equal(
    (await page.evaluate(() => window.workbenchDesktop.openAIStatus())).source,
    "desktop",
  );
  assert.equal(
    (await api(base, "/providers")).providers.find((p) => p.id === "openai")
      .credentialSuffix,
    null,
  );
  assert.deepEqual((await api(base, "/settings")).routing.applicationDefault, {
    providerId: "mock",
    modelId: "conservative",
  });
  const encrypted = readFileSync(
    join(dir, "provider-credentials.json"),
    "utf8",
  );
  assert.ok(!encrypted.includes(syntheticKey));
  for (const name of [
    "workbench.sqlite",
    "workbench.sqlite-wal",
    "workbench.sqlite-shm",
  ])
    if (existsSync(join(dir, name)))
      assert.ok(
        !readFileSync(join(dir, name)).includes(Buffer.from(syntheticKey)),
      );
  assert.ok(
    !JSON.stringify(await api(base, `/documents/${created.id}`)).includes(
      syntheticKey,
    ),
  );
  assert.ok(
    !readFileSync(join(dir, "logs/desktop.log"), "utf8").includes(syntheticKey),
  );
  stage = "Test and refresh explicitly";
  await card
    .getByRole("button", { name: "Test connection · OpenAI Direct" })
    .click();
  await card
    .getByRole("status")
    .filter({ hasText: "Connection succeeded" })
    .waitFor();
  await card
    .getByRole("button", { name: "Refresh models · OpenAI Direct" })
    .click();
  await card.getByRole("status").filter({ hasText: "2 compatible" }).waitFor();
  const discovered = (await api(base, "/providers")).providers.find(
    (p) => p.id === "openai",
  ).models;
  assert.ok(
    discovered.some(
      (model) =>
        model.id === "gpt-6.1-something" && model.availability === "available",
    ),
  );
  assert.ok(
    !discovered.some(
      (model) =>
        model.id === "gpt-5-chat-latest" && model.availability === "available",
    ),
  );
  assert.deepEqual(
    await desktop.evaluate(() => globalThis.desktopFixtureCalls),
    ["/v1/responses", "/v1/models"],
  );
  stage = "Explicit model routing";
  await page
    .getByRole("dialog")
    .getByText("Application and task defaults")
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Application default model", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-6.1-something"]));
  await page
    .getByRole("dialog")
    .getByLabel("Document default model", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-4.1-mini"]));
  await page
    .getByRole("dialog")
    .getByLabel("Task default")
    .selectOption("coach");
  await page
    .getByRole("dialog")
    .getByLabel("Task model", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-6.1-something"]));
  await page
    .getByRole("dialog")
    .getByLabel("Section type model", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-4.1-mini"]));
  await card.getByText("Enter model ID manually", { exact: true }).click();
  await card
    .getByLabel("Manual model ID · OpenAI Direct")
    .fill("gpt-6.1-manual-example");
  await card.getByRole("button", { name: "Add model ID" }).click();
  assert.ok(
    (await api(base, "/providers")).providers
      .find((p) => p.id === "openai")
      .models.some((m) => m.id === "gpt-6.1-manual-example"),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
  await page.locator(".model-controls > summary").click();
  await page
    .getByLabel("Section model", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-4.1-mini"]));
  await page
    .getByLabel("Run with", { exact: true })
    .selectOption(JSON.stringify(["openai", "gpt-6.1-something"]));
  await page.getByText("Compare models", { exact: true }).click();
  assert.ok(
    (await page.locator(".compare-choices").innerText()).includes(
      "gpt-6.1-something",
    ),
  );
  assert.ok(
    !(await page.locator(".compare-choices").innerText()).includes(
      "gpt-6.1-manual-example",
    ),
  );
  await page.getByLabel("Your direction").fill("What is this sentence doing?");
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await page
    .locator(".diagnosis")
    .filter({ hasText: "Fixture-only diagnosis" })
    .waitFor();
  await page.getByTestId("save-state").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="save-state"]')
        ?.textContent?.trim() === "Saved",
  );
  assert.ok(
    (await api(base, `/documents/${created.id}`)).sections.some((section) =>
      section.workbench?.runs?.some(
        (run) => run.model?.modelId === "gpt-6.1-something",
      ),
    ),
  );
  assert.deepEqual(
    await desktop.evaluate(() => globalThis.desktopFixtureCalls),
    ["/v1/responses", "/v1/models", "/v1/responses"],
  );
  stage = "Find a tool";
  await page.getByRole("button", { name: "Find a tool", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  stage = "Responsive desktop window";
  for (const width of [1440, 1024, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    assert.ok(
      overflow <= 1,
      `Desktop content overflowed by ${overflow}px at width ${width}`,
    );
  }
  await page.setViewportSize({ width: 1320, height: 860 });
  stage = "Copy whole piece";
  await page.getByRole("button", { name: "Copy whole piece" }).click();
  await page.waitForFunction(async () =>
    (await navigator.clipboard.readText()).includes("Desktop prose survives."),
  );
  stage = "Download exports";
  for (const [label, extension] of [
    ["PDF", "pdf"],
    ["Word document (.docx)", "docx"],
    ["Markdown (.md)", "md"],
  ]) {
    stage = `Download ${extension}`;
    await page.getByText("Download", { exact: true }).click();
    await page.getByRole("button", { name: label, exact: true }).click();
    const path = join(dir, "exports", `Disposable Desktop Smoke.${extension}`);
    for (let i = 0; i < 300 && !existsSync(`${path}.done`); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(
      existsSync(`${path}.done`) && existsSync(path),
      `${extension} was not fully saved in the disposable profile`,
    );
    const bytes = readFileSync(path);
    assert.ok(!bytes.includes(Buffer.from(syntheticKey)));
    assert.ok(bytes.length > 30);
    if (extension === "pdf")
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    if (extension === "docx")
      assert.equal(bytes.subarray(0, 2).toString(), "PK");
    if (extension === "md")
      assert.ok(bytes.toString().includes("More human words."));
  }
  stage = "Second-instance focus";
  const secondApp = spawn(executablePath, [], { env, stdio: "ignore" });
  let timer;
  const [secondExit] = await Promise.race([
    once(secondApp, "exit"),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        secondApp.kill();
        reject(new Error("Second app launch did not exit"));
      }, 10_000);
    }),
  ]);
  clearTimeout(timer);
  assert.equal(secondExit, 0);
  assert.equal(
    readFileSync(join(dir, "logs/desktop.log"), "utf8").split(
      "Desktop backend ready on",
    ).length - 1,
    1,
  );
  stage = "Reload and quit";
  const originalPort = new URL(page.url()).port;
  await page.reload();
  await page.getByTestId("save-state").waitFor();
  assert.equal(new URL(page.url()).port, originalPort);
  await desktop.close();
  desktop = undefined;
  const log = readFileSync(join(dir, "logs/desktop.log"), "utf8");
  assert.ok(log.includes("Desktop backend closed"));
  assert.equal(log.split("Desktop backend ready on").length - 1, 1);
  stage = "Relaunch";
  page = await start();
  assert.ok(
    (await api(page.url().replace(/\/$/, ""), "/documents")).some(
      (doc) => doc.id === created.id,
    ),
  );
  await page.getByLabel("Switch document").selectOption(created.id);
  await page
    .getByRole("button", { name: "Document View", exact: true })
    .click();
  assert.ok(
    (await page.getByTestId("writing-editor").innerText()).includes(
      "More human words.",
    ),
  );
  stage = "Replace and remove desktop API key";
  assert.equal(
    (await page.evaluate(() => window.workbenchDesktop.openAIStatus())).source,
    "desktop",
  );
  const replacementKey = "sk-desktop-smoke-second-fake-key-54321";
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "AI providers" })
    .click();
  const relaunchCard = page
    .getByRole("dialog")
    .locator(".provider-card")
    .filter({
      has: page.getByRole("heading", { name: "OpenAI Direct", exact: true }),
    });
  await relaunchCard.getByRole("button", { name: "Replace key" }).click();
  await relaunchCard
    .getByLabel("Replacement OpenAI API key")
    .fill(replacementKey);
  await relaunchCard.getByRole("button", { name: "Save API key" }).click();
  await relaunchCard
    .locator(".guidance[role=status]")
    .filter({ hasText: "API key saved" })
    .waitFor();
  const replacementFile = readFileSync(
    join(dir, "provider-credentials.json"),
    "utf8",
  );
  assert.ok(
    !replacementFile.includes(syntheticKey) &&
      !replacementFile.includes(replacementKey),
  );
  await relaunchCard.getByRole("button", { name: "Remove key" }).click();
  await page
    .getByRole("group", { name: "Confirm API key removal" })
    .getByRole("button", { name: "Confirm remove key" })
    .click();
  await relaunchCard
    .getByRole("status")
    .filter({ hasText: "Local API key removed" })
    .waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.workbenchDesktop.openAIStatus()),
    { configured: false, source: "removed", canStore: true },
  );
  assert.equal(
    (await api(page.url().replace(/\/$/, ""), "/providers")).providers.find(
      (p) => p.id === "openai",
    ).configured,
    false,
  );
  const routing = (await api(page.url().replace(/\/$/, ""), "/settings"))
    .routing;
  assert.deepEqual(routing.applicationDefault, {
    providerId: "openai",
    modelId: "gpt-6.1-something",
  });
  assert.deepEqual(routing.taskDefaults.coach, {
    providerId: "openai",
    modelId: "gpt-6.1-something",
  });
  assert.deepEqual(routing.sectionTypeDefaults.Hook, {
    providerId: "openai",
    modelId: "gpt-4.1-mini",
  });
  const savedRoute = await api(
    page.url().replace(/\/$/, ""),
    `/documents/${created.id}`,
  );
  assert.equal(
    savedRoute.draftRevision,
    authoredBeforeCredential.draftRevision,
  );
  assert.deepEqual(
    savedRoute.sections.map((section) => section.content),
    authoredBeforeCredential.sections.map((section) => section.content),
  );
  assert.deepEqual(
    savedRoute.pieceMemory,
    authoredBeforeCredential.pieceMemory,
  );
  assert.deepEqual(
    savedRoute.revisionPlan,
    authoredBeforeCredential.revisionPlan,
  );
  assert.deepEqual(savedRoute.defaultModel, {
    providerId: "openai",
    modelId: "gpt-4.1-mini",
  });
  assert.ok(
    savedRoute.sections.some(
      (section) => section.modelOverride?.modelId === "gpt-4.1-mini",
    ),
  );
  assert.ok(
    savedRoute.sections.some((section) =>
      section.workbench?.runs?.some(
        (run) => run.model?.modelId === "gpt-6.1-something",
      ),
    ),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
  await page.getByRole("button", { name: /Diagnose this/ }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /unavailable|not configured/i })
    .waitFor();
  stage = "Re-add desktop API key";
  await page.getByRole("button", { name: "Document actions" }).click();
  await page
    .getByRole("group", { name: "Document commands" })
    .getByRole("button", { name: "AI providers" })
    .click();
  const restoredCard = page
    .getByRole("dialog")
    .locator(".provider-card")
    .filter({
      has: page.getByRole("heading", { name: "OpenAI Direct", exact: true }),
    });
  await restoredCard.getByRole("button", { name: "Add API key" }).click();
  await restoredCard.getByLabel("New OpenAI API key").fill(syntheticKey);
  await restoredCard.getByRole("button", { name: "Save API key" }).click();
  await restoredCard
    .locator(".guidance[role=status]")
    .filter({ hasText: "API key saved" })
    .waitFor();
  await desktop.close();
  desktop = undefined;
  stage = "Final credential relaunch";
  page = await start();
  assert.equal(
    (await page.evaluate(() => window.workbenchDesktop.openAIStatus())).source,
    "desktop",
  );
  assert.equal(
    (await api(page.url().replace(/\/$/, ""), "/providers")).providers.find(
      (p) => p.id === "openai",
    ).configured,
    true,
  );
  await desktop.close();
  desktop = undefined;
  assert.equal(existsSync(join(dir, "workbench.sqlite")), true);
  assert.equal(devBefore, existsSync(devDb) ? statSync(devDb).mtimeMs : null);
  assert.ok(
    readdirSync(join(dir, "backups")).some((name) => name.endsWith(".sqlite")),
  );
  success = true;
  console.log(
    "PASS: packaged Electron app persisted isolated writing; encrypted BYOK Add, Test, catalog refresh, routed Lab, Replace, Remove and re-add survived restarts without live calls, lost routes or secret disclosure; PDF/DOCX/Markdown and cleanup passed.",
  );
} catch (error) {
  console.error(`Desktop smoke failed at ${stage}:`, error);
  try {
    await page?.screenshot({ path: join(dir, "failure.png"), timeout: 3000 });
  } catch {}
  throw error;
} finally {
  if (desktop) {
    if (success) await desktop.close();
    else await desktop.evaluate(({ app }) => app.exit(1)).catch(() => {});
  }
  if (success) rmSync(dir, { recursive: true, force: true });
  else
    console.error(`Desktop smoke data and logs retained for diagnosis: ${dir}`);
}
