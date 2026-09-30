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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close dialog" })
    .click();
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
  assert.ok(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      "Desktop prose survives.",
    ),
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
    for (let i = 0; i < 100 && !existsSync(path); i++)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(
      existsSync(path),
      `${extension} was not saved in the disposable profile`,
    );
    const bytes = readFileSync(path);
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
  await desktop.close();
  desktop = undefined;
  assert.equal(existsSync(join(dir, "workbench.sqlite")), true);
  assert.equal(devBefore, existsSync(devDb) ? statSync(devDb).mtimeMs : null);
  assert.ok(
    readdirSync(join(dir, "backups")).some((name) => name.endsWith(".sqlite")),
  );
  success = true;
  console.log(
    "PASS: packaged Electron app launched without pnpm, edited and persisted isolated SQLite data, copied and saved PDF/DOCX/Markdown, reloaded without duplicate backend, quit and relaunched cleanly.",
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
