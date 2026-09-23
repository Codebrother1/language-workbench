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
async function start(apiKey = "") {
  child = spawn(
    process.execPath,
    [resolve(root, "apps/server/dist/index.js")],
    {
      cwd: tmpdir(),
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dir,
        OPENAI_API_KEY: apiKey,
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
  const conservative = { providerId: "mock", modelId: "conservative" },
    plain = { providerId: "mock", modelId: "plain" };
  doc.defaultModel = conservative;
  doc.sections[0].modelOverride = plain;
  doc.sections.push({
    id: "segue-restart",
    kind: "Segue",
    label: "Segue",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "The next idea stays unchanged." }],
      },
    ],
    notes: "",
    variants: [],
    modelOverride: conservative,
    workbench: { instruction: "Only this Segue", answer: "My connection" },
  });
  const prefs = await api("/settings");
  const response = await api("/ai", "POST", {
    readContext: {
      document: doc,
      styleDNA: prefs.styleDNA,
      knowledgePacks: prefs.knowledgePacks,
      approvedLanguage: [],
    },
    editTarget: target,
    action: "coach",
    stage: "diagnose",
    instruction: "Only this Hook",
    answer: "My observation",
    controls: {},
    variantCount: 2,
  });
  assert.deepEqual(response.model, plain);
  doc.sections[0].workbench = {
    instruction: "Only this Hook",
    answer: "My observation",
    activeRunId: "run-restart",
    runs: [
      {
        id: "run-restart",
        createdAt: new Date().toISOString(),
        target,
        action: "coach",
        instruction: "Only this Hook",
        answer: "My observation",
        controls: {},
        model: response.model,
        response,
      },
    ],
  };
  doc.sections[0].workbench.structure = {
    raw: "Useful, but costly.",
    thoughtA: "The software was useful",
    thoughtB: "it was too expensive",
    relationship: "contrast",
    register: "technical",
    scaffoldId: "contrast-separate",
    connectorId: "contrast-however",
    customTemplate: "[X]; however, [Y].",
  };
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
  settings.routing = {
    applicationDefault: null,
    sectionTypeDefaults: { Hook: plain },
    taskDefaults: { words: conservative },
  };
  await api("/settings", "PUT", settings);
  await api("/providers/openai/models", "POST", {
    id: "smoke-catalog-fixture",
  });
  const catalog = await api("/providers");
  const initialLibrary = await api("/library");
  const now = new Date().toISOString();
  const kinds = [
    "snippet",
    "pattern",
    "move",
    "style_example",
    "style_rule",
    "connector",
  ];
  const items = kinds.map((kind, index) => ({
    id: "library-" + index,
    kind,
    title: "Personal " + kind,
    content:
      kind === "pattern"
        ? "[X], but [Y]."
        : kind === "style_rule"
          ? "One line; no summary."
          : kind === "connector"
            ? "however"
            : "que sera sera",
    notes: "Why I saved it",
    tags: ["my-custom-tag", "Ominous"],
    effects: ["resigned"],
    sectionKinds: ["Closer"],
    contentTypes: ["reply"],
    register: kind === "connector" ? "technical" : "",
    preference: kind === "connector" ? "avoid" : "reference",
    ruleKey: kind === "style_rule" ? "endingStyles" : "",
    myLanguage: kind === "snippet",
    createdAt: now,
    updatedAt: now,
  }));
  items.push({
    ...items[4],
    id: "content-rule",
    title: "Reply style",
    sectionKinds: [],
    contentTypes: ["reply"],
    ruleKey: "sentenceLengths",
    content: "One sentence may be complete.",
  });
  const personalLibrary = await api("/library", "PUT", {
    ...initialLibrary,
    items,
  });
  await stop();
  await start();
  assert.deepEqual(await api("/documents/" + doc.id), doc);
  assert.deepEqual(await api("/settings"), settings);
  assert.deepEqual(await api("/providers"), catalog);
  assert.deepEqual(await api("/library"), personalLibrary);
  assert.equal(
    (await fetch(base + "/.env")).headers
      .get("content-type")
      ?.includes("text/html"),
    true,
  );
  await stop();
  // A synthetic credential configures the adapter without sending any provider call.
  const secret = "sk-security-fixture-never-a-real-key-8765";
  await start(secret);
  const safe = await api("/providers");
  assert.equal(
    safe.providers.find((p) => p.id === "openai").credentialSuffix,
    "8765",
  );
  for (const path of [
    "/providers",
    "/settings",
    "/documents",
    "/health",
    "/library",
  ])
    assert.ok(!JSON.stringify(await api(path)).includes(secret));
  const html = await (await fetch(base)).text();
  assert.ok(!html.includes(secret));
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.ok(scripts.length > 0);
  for (const url of scripts) {
    const js = await (await fetch(new URL(url, base))).text();
    assert.ok(
      !js.includes(secret),
    ); /* Environment variable names in settings instructions are public, not credentials. */
  }
  console.log(
    "PASS: section-local drafts/runs, independent model overrides, routing defaults and catalogs survive restart; provider endpoints and served frontend do not expose a configured synthetic credential.",
  );
  console.log(
    "PASS: all personal-library object kinds, custom tags/effects, connector avoidance, scoped guides and Structure drafts survive a real server restart.",
  );
  console.log(
    "PASS: built production entrypoint starts from arbitrary cwd; frontend serves; mock provider; SQLite document/brief/source/metadata/variant/history and Style DNA/packs/radar/theme survive process restart.",
  );
} finally {
  await stop();
  await rm(dir, { recursive: true, force: true });
}
