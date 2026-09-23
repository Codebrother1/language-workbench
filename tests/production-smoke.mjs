// Verifies the actual built Node entrypoint, not an in-memory test app.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "workbench-production-"));
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
let child;
async function start() {
  child = spawn(
    process.execPath,
    [resolve(root, "apps/server/dist/index.js")],
    {
      cwd: tmpdir(),
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dir,
        OPENAI_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error("Production server startup timed out")),
      10000,
    );
    const fail = (code) => {
      clearTimeout(deadline);
      reject(new Error("Server exited " + code));
    };
    child.once("exit", fail);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Language Workbench:")) {
        clearTimeout(deadline);
        child.off("exit", fail);
        resolve();
      }
    });
  });
}
async function stop() {
  if (child && child.exitCode === null) {
    const stopped = once(child, "exit");
    child.kill("SIGTERM");
    await stopped;
  }
}
async function api(path, method = "GET", body) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(res.ok, `${method} ${path}: ${res.status}`);
  return res.json();
}
try {
  await start();
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await api("/health")).provider, "mock");
  let doc = await api("/documents", "POST", {
    title: "Restart proof",
    text: "Human language survives the process.",
  });
  const text = "Human language survives the process.";
  const target = {
    scope: "section",
    sectionId: doc.sections[0].id,
    start: 0,
    end: text.length,
    text,
    sectionSnapshot: text,
    documentId: doc.id,
    documentRevision: doc.revision,
  };
  doc.sources = [
    {
      id: "source",
      title: "Actual quote",
      kind: "quote",
      text: "Do not alter this.",
      url: "",
    },
  ];
  doc.brief.contentType = "reply";
  doc.sections[0].kind = "Hook";
  doc.sections[0].notes = "Metadata survives.";
  doc.sections[0].variants = [
    {
      id: "v",
      label: "Original",
      text,
      target,
      createdAt: new Date().toISOString(),
      origin: "original",
    },
  ];
  doc.history = [
    {
      id: "h",
      createdAt: new Date().toISOString(),
      target,
      instruction: "Read broadly",
      coachQuestion: "What do you mean?",
      userAnswer: "This exact thought.",
      proposal: "Human language survives.",
      state: "saved",
      provider: "mock",
    },
  ];
  doc = await api("/documents/" + doc.id, "PUT", doc);
  const settings = await api("/settings");
  settings.styleDNA.rhythm = "Fragments. Then a long breath.";
  settings.styleDNA.neverSuggest = ["synergy"];
  settings.theme = "dark";
  settings.knowledgePacks[0].principles = "My lawful technical notes.";
  settings.radar = [
    {
      id: "r",
      term: "example construction",
      meaning: "User-supplied research fixture, not a trend claim",
      mechanism: "Comparison",
      pattern: "X as Y",
      seriousUsage: "Comparison",
      ironicUsage: "Contradiction",
      exampleStructure: "[X] as [Y]",
      relatedTerms: [],
      caveat: "Synthetic test fixture",
      sources: [],
      discoveredAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      status: "maybe",
    },
  ];
  await api("/settings", "PUT", settings);
  await stop();
  await start();
  assert.deepEqual(await api("/documents/" + doc.id), doc);
  assert.deepEqual(await api("/settings"), settings);
  assert.equal(
    (await fetch(base + "/.env")).headers
      .get("content-type")
      ?.includes("text/html"),
    true,
  );
  console.log(
    "PASS: built production entrypoint starts from arbitrary cwd; frontend serves; mock provider; SQLite document/brief/source/metadata/variant/history and Style DNA/packs/radar/theme survive process restart.",
  );
} finally {
  await stop();
  await rm(dir, { recursive: true, force: true });
}
