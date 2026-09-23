import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../apps/server/src/app";
import { Repository } from "../apps/server/src/repository";
import { ProviderRegistry } from "../apps/server/src/provider-registry";
import { MockProvider } from "../apps/server/src/mock-provider";
import {
  aiRequestSchema,
  defaultSettings,
  newDocument,
  targetFor,
  resolveModel,
  providerCatalogSchema,
  emptyWorkbench,
  type ModelRef,
  type AIResponse,
} from "../packages/domain/src/index";
const { default: OpenAI } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("openai");
const key = "sk-unit-secret-never-display-9842";
const mock: ModelRef = { providerId: "mock", modelId: "conservative" };
const plain: ModelRef = { providerId: "mock", modelId: "plain" };
const openai: ModelRef = { providerId: "openai", modelId: "gpt-4.1-mini" };
const output: AIResponse = {
  provider: "openai",
  diagnosis: "Test diagnosis",
  mechanism: "Test mechanism",
  question: "",
  missingIngredients: [],
  findings: [],
  lexical: [],
  proposals: [],
};
let directory: string,
  repository: Repository,
  registry: ProviderRegistry,
  server: Server,
  base: string;
let calls: { url: string; body: any }[], fail: boolean;
function fixture() {
  const document = newDocument("draft", "They were larping as experts.");
  const settings = defaultSettings();
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: settings.styleDNA,
      knowledgePacks: settings.knowledgePacks,
      approvedLanguage: [],
    },
    editTarget: targetFor(document, document.sections[0].id),
    action: "coach",
    stage: "diagnose",
    controls: { intensity: 12 },
    instruction: "Do not edit surrounding text.",
  });
}
async function start(
  env: Record<string, string | undefined> = {
    OPENAI_API_KEY: key,
    OPENROUTER_API_KEY: "unsupported-secret-8822",
  },
) {
  repository = new Repository(directory);
  const client = new OpenAI({
    apiKey: key,
    maxRetries: 0,
    fetch: async (url: unknown, init: RequestInit) => {
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: String(url), body });
      if (fail || body?.model === "failing-model")
        return new Response(
          JSON.stringify({
            error: { message: key, type: "invalid_request_error" },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      const data = String(url).endsWith("/models")
        ? {
            object: "list",
            data: [
              {
                id: "gpt-4.1-mini",
                object: "model",
                created: 1,
                owned_by: "openai",
              },
              {
                id: "unknown-capabilities",
                object: "model",
                created: 1,
                owned_by: "openai",
              },
            ],
          }
        : {
            id: "resp_test",
            object: "response",
            created_at: 1,
            status: "completed",
            output: [
              {
                type: "message",
                id: "msg_test",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(output),
                    annotations: [],
                  },
                ],
              },
            ],
          };
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  registry = new ProviderRegistry({ repository, env, client });
  server = await new Promise<Server>((resolve) => {
    const s = createApp({
      repository,
      provider: new MockProvider(),
      registry,
    }).listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function stop() {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  repository.close();
}
async function api(path: string, method = "GET", body?: unknown) {
  return fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "routing-"));
  calls = [];
  fail = false;
  await start();
});
afterEach(async () => {
  await stop();
  rmSync(directory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("provider catalog, environment boundary and persistence", () => {
  it("publishes truthful descriptors, no raw keys and no background discovery", async () => {
    const result = await (await api("/api/providers")).json();
    expect(providerCatalogSchema.safeParse(result).success).toBe(true);
    expect(result.applicationDefault).toEqual(openai);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(
      result.providers.find((p: any) => p.id === "openai").credentialSuffix,
    ).toBe("9842");
    expect(
      result.providers.find((p: any) => p.id === "openrouter"),
    ).toMatchObject({ configured: true, implemented: false, enabled: false });
    expect(
      result.providers
        .find((p: any) => p.id === "mock")
        .models.map((m: any) => m.displayName),
    ).toEqual(["Offline conservative", "Offline plain"]);
    expect(calls).toEqual([]);
  });
  it("discovers with the official SDK, keeps unknown capabilities unknown, and persists cache/manual IDs/disable over restart", async () => {
    const refreshed = await (
      await api("/api/providers/openai/models/refresh", "POST", {})
    ).json();
    expect(refreshed.provider.lastRefreshedAt).toBeTruthy();
    expect(
      refreshed.provider.models.find(
        (m: any) => m.id === "unknown-capabilities",
      ).capabilities,
    ).toEqual({});
    await api("/api/providers/openai/models", "POST", {
      id: "ft:team/custom-v1",
      displayName: "Personal model",
    });
    await api("/api/providers/openai", "PATCH", { enabled: false });
    const before = await (await api("/api/providers")).json();
    const n = calls.length;
    await stop();
    await start();
    expect(await (await api("/api/providers")).json()).toEqual(before);
    expect(calls.length).toBe(n);
    expect(
      readFileSync(join(directory, "workbench.sqlite")).includes(
        Buffer.from(key),
      ),
    ).toBe(false);
  });
  it("reads the persisted catalog in a fresh Node process with no in-memory registry", async () => {
    await api("/api/providers/openai/models/refresh", "POST", {});
    registry.addModel("openai", "manual-persisted");
    registry.setEnabled("openai", false);
    const script = `import {Repository} from './apps/server/src/repository.ts';import {ProviderRegistry} from './apps/server/src/provider-registry.ts';const repository=new Repository(${JSON.stringify(directory)});const registry=new ProviderRegistry({repository,env:{}});process.stdout.write(JSON.stringify(registry.get('openai')));repository.close();`;
    const stdout = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        encoding: "utf8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      },
    );
    const p = JSON.parse(stdout);
    expect(p.enabled).toBe(false);
    expect(p.configured).toBe(false);
    expect(p.lastRefreshedAt).toBeTruthy();
    expect(p.models.some((m: any) => m.id === "manual-persisted")).toBe(true);
  });
  it("discovery cannot undo a concurrent disable or manual model addition", async () => {
    let finish!: (value: { data: { id: string }[] }) => void;
    const client = {
      models: {
        list: () =>
          new Promise<{ data: { id: string }[] }>((resolve) => {
            finish = resolve;
          }),
      },
      responses: {},
    };
    const r = new ProviderRegistry({
      repository,
      env: { OPENAI_API_KEY: key },
      client: client as never,
    });
    const refresh = r.refresh("openai");
    r.setEnabled("openai", false);
    r.addModel("openai", "added-during-discovery");
    finish({ data: [{ id: "gpt-4.1-mini" }] });
    const p = await refresh;
    expect(p.enabled).toBe(false);
    expect(p.models.some((m) => m.id === "added-during-discovery")).toBe(true);
  });
  it("failed refresh preserves cache, test errors are sanitized, and credential setters are rejected", async () => {
    await api("/api/providers/openai/models/refresh", "POST", {});
    const before = registry.get("openai");
    fail = true;
    const response = await api(
      "/api/providers/openai/models/refresh",
      "POST",
      {},
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(key);
    expect(registry.get("openai")).toEqual(before);
    const test = await (
      await api("/api/providers/openai/test", "POST", {
        modelId: openai.modelId,
      })
    ).json();
    expect(test.ok).toBe(false);
    expect(JSON.stringify(test)).not.toContain(key);
    expect(
      (
        await api("/api/providers/openai", "PATCH", {
          enabled: true,
          apiKey: "new-key",
        })
      ).status,
    ).toBe(400);
  });
  it("unsupported adapters do not call network even when configured; missing keys never fall back", async () => {
    for (const id of ["openrouter", "vercel", "custom"]) {
      expect(
        (await api(`/api/providers/${id}/models/refresh`, "POST", {})).status,
      ).toBe(400);
      expect(
        (await (await api(`/api/providers/${id}/test`, "POST", {})).json()).ok,
      ).toBe(false);
      expect(
        (await api(`/api/providers/${id}`, "PATCH", { enabled: true })).status,
      ).toBe(400);
    }
    expect(calls).toEqual([]);
    await stop();
    await start({});
    expect(registry.applicationDefault).toEqual(mock);
    const input = fixture();
    input.modelOverride = openai;
    const response = await api("/api/ai", "POST", input);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not configured");
    expect(calls).toEqual([]);
  });
  it("tests OpenAI connection via the same Responses SDK with explicit model", async () => {
    const result = await (
      await api("/api/providers/openai/test", "POST", {
        modelId: openai.modelId,
      })
    ).json();
    expect(result.ok).toBe(true);
    expect(calls[0].body).toMatchObject({
      model: openai.modelId,
      store: false,
    });
    expect(
      (await api("/api/providers/unknown/models/refresh", "POST", {})).status,
    ).toBe(404);
  });
});

describe("one authoritative routing algorithm and immutable comparison", () => {
  it("resolves all six levels in order and honors stored settings rather than caller routing", async () => {
    const input = fixture();
    const doc = input.readContext.document;
    const section = doc.sections[0];
    const settings = repository.getSettings();
    settings.routing = {
      applicationDefault: mock,
      taskDefaults: { coach: plain },
      sectionTypeDefaults: { Freeform: mock },
    };
    repository.saveSettings(settings);
    doc.defaultModel = plain;
    section.modelOverride = plain;
    input.modelOverride = mock;
    expect(registry.resolve(input)).toEqual({ model: mock, source: "action" });
    delete input.modelOverride;
    expect(registry.resolve(input).source).toBe("section");
    delete section.modelOverride;
    expect(registry.resolve(input).source).toBe("section_type");
    settings.routing.sectionTypeDefaults = {};
    repository.saveSettings(settings);
    expect(registry.resolve(input).source).toBe("task");
    settings.routing.taskDefaults = {};
    repository.saveSettings(settings);
    expect(registry.resolve(input).source).toBe("document");
    delete doc.defaultModel;
    expect(registry.resolve(input)).toEqual({
      model: mock,
      source: "application",
    });
    expect(resolveModel({ task: "coach", applicationDefault: openai })).toEqual(
      { model: openai, source: "application" },
    );
    const response = await (
      await api("/api/ai", "POST", {
        ...input,
        routing: { applicationDefault: openai },
      })
    ).json();
    expect(response.model).toEqual(mock);
    expect(response.routeSource).toBe("application");
    expect(calls).toEqual([]);
  });
  it("routes words/lens, critique, and culture tasks; unsupported web search fails explicitly", async () => {
    const settings = repository.getSettings();
    settings.routing = {
      applicationDefault: openai,
      sectionTypeDefaults: {},
      taskDefaults: { words: plain, critique: mock, culture: mock },
    };
    repository.saveSettings(settings);
    const input = fixture();
    input.action = "words";
    expect(registry.resolve(input).model).toEqual(plain);
    input.action = "critique";
    expect(registry.resolve(input).model).toEqual(mock);
    input.action = "coach";
    input.lens = {
      mode: "explore",
      fidelity: "exact",
      shape: "word",
      intent: "",
      persona: "",
      technical: false,
    };
    expect(registry.resolve(input).model).toEqual(plain);
    const result = await api("/api/culture/refresh", "POST", {
      query: "current usage",
    });
    expect(result.status).toBe(400);
    expect(await result.text()).toContain("Web search");
    expect(calls).toEqual([]);
  });
  it("fails closed for disabled and unknown models, even with working application default", async () => {
    const input = fixture();
    input.modelOverride = { providerId: "mock", modelId: "missing" };
    expect((await api("/api/ai", "POST", input)).status).toBe(400);
    input.modelOverride = mock;
    registry.setEnabled("mock", false);
    expect((await api("/api/ai", "POST", input)).status).toBe(400);
    expect(calls).toEqual([]);
  });
  it("compares equivalent contexts and controls with partial errors, no canonical writes and bounded distinct choices", async () => {
    registry.addModel("openai", "failing-model");
    const input = fixture();
    repository.import(input.readContext.document);
    const before = repository.list();
    const results = (
      await (
        await api("/api/ai/compare", "POST", {
          request: input,
          models: [
            openai,
            { providerId: "openai", modelId: "failing-model" },
            plain,
          ],
        })
      ).json()
    ).results;
    expect(results).toHaveLength(3);
    expect(results[0].response.model).toEqual(openai);
    expect(results[1].error).toBeTruthy();
    expect(JSON.stringify(results)).not.toContain(key);
    expect(results[2].response.model).toEqual(plain);
    expect(calls[0].body.input).toEqual(calls[1].body.input);
    expect(repository.list()).toEqual(before);
    for (const models of [
      [mock],
      [mock, mock],
      [
        mock,
        plain,
        openai,
        { providerId: "mock", modelId: "x" },
        { providerId: "mock", modelId: "y" },
      ],
    ])
      expect(
        (await api("/api/ai/compare", "POST", { request: input, models }))
          .status,
      ).toBe(400);
  });
  it("remaps imported workbench runs, finding section IDs, active runs and history refs while retaining model metadata", () => {
    const input = fixture(),
      doc = input.readContext.document;
    const section = doc.sections[0];
    section.workbench = emptyWorkbench();
    section.workbench.runs = [
      {
        id: "run",
        createdAt: new Date().toISOString(),
        target: input.editTarget,
        action: "coach",
        instruction: "i",
        answer: "",
        controls: {},
        model: plain,
        response: {
          ...output,
          model: plain,
          routeSource: "action",
          findings: [
            {
              sectionId: section.id,
              title: "Pattern",
              detail: "Evidence",
              severity: "note",
            },
          ],
        },
      },
    ];
    section.workbench.activeRunId = "run";
    section.modelOverride = plain;
    doc.defaultModel = openai;
    section.variants = [
      {
        id: "v",
        label: "test",
        text: "test",
        target: input.editTarget,
        createdAt: "now",
        origin: "ai",
        model: plain,
        runId: "run",
      },
    ];
    const imported = repository.import(doc),
      s = imported.sections[0],
      r = s.workbench!.runs[0];
    expect(r.id).not.toBe("run");
    expect(s.workbench!.activeRunId).toBe(r.id);
    expect(s.variants[0].runId).toBe(r.id);
    expect(r.target.documentId).toBe(imported.id);
    expect(r.target.sectionId).toBe(s.id);
    expect(r.response.findings[0].sectionId).toBe(s.id);
    expect(r.response.model).toEqual(plain);
    expect(imported.defaultModel).toEqual(openai);
  });
});
