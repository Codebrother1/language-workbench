import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../apps/server/src/app";
import { Repository } from "../apps/server/src/repository";
import { MockProvider } from "../apps/server/src/mock-provider";
import { ProviderRegistry } from "../apps/server/src/provider-registry";
import { enrichWritingRequest } from "../apps/server/src/writing-context";
import {
  forbiddenPhrases,
  proposalViolation,
} from "../apps/server/src/provider-policy";
import {
  aiRequestSchema,
  defaultSettings,
  emptyLibrary,
  libraryItemSchema,
  libraryKinds,
  newDocument,
  targetFor,
  type LibraryItem,
} from "../packages/domain/src/index";

const item = (id: string, overrides: Partial<LibraryItem> = {}) =>
  libraryItemSchema.parse({
    id,
    kind: "snippet",
    title: id,
    content: "Human wording",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  });
function fixture() {
  const document = newDocument("draft", "I really write this.");
  document.sections[0].kind = "Hook";
  document.sections[0].notes = "rhythm: section note";
  document.brief.audience = "Engineers";
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: defaultSettings().styleDNA,
      knowledgePacks: [],
      approvedLanguage: [],
    },
    editTarget: targetFor(document, document.sections[0].id),
    action: "coach",
    stage: "diagnose",
    instruction: "rhythm: current",
  });
}
let dir: string,
  repository: Repository,
  server: Server,
  base: string,
  provider: MockProvider;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "library-test-"));
  repository = new Repository(dir);
  provider = new MockProvider();
  server = await new Promise<Server>((resolve) => {
    const s = createApp({ repository, provider }).listen(0, "127.0.0.1", () =>
      resolve(s),
    );
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  repository.close();
  rmSync(dir, { recursive: true, force: true });
});
const call = (path: string, method = "GET", body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe("separate personal library persistence", () => {
  it("CRUD validates, CAS increments once, exports all types and preserves tags/scopes/counts across restart", async () => {
    expect(await (await call("/api/library")).json()).toEqual(emptyLibrary());
    const settingsBefore = repository.getSettings();
    const library = {
      ...emptyLibrary(),
      items: libraryKinds.map((kind) =>
        item(kind, {
          kind,
          tags: ["my custom tag"],
          audiences: ["Engineers"],
          sectionKinds: ["Hook"],
          contentTypes: ["Essay"],
          register: "technical",
          useCount: 7,
          lastUsedAt: "2026-01-02",
          ruleKey: kind === "style_rule" ? "rhythm" : "",
          preference: kind === "connector" ? "avoid" : "reference",
        }),
      ),
    };
    const saved = await (await call("/api/library", "PUT", library)).json();
    expect(saved).toEqual({ ...library, revision: 1 });
    expect((await call("/api/library", "PUT", library)).status).toBe(409);
    expect(
      (await call("/api/library", "PUT", { ...saved, items: [{ nope: true }] }))
        .status,
    ).toBe(400);
    repository.close();
    repository = new Repository(dir);
    expect(repository.getLibrary()).toEqual(saved);
    expect(repository.getSettings()).toEqual(settingsBefore);
    const db = new DatabaseSync(join(dir, "workbench.sqlite"));
    expect(
      db.prepare("SELECT revision FROM library WHERE id=1").get()?.revision,
    ).toBe(1);
    db.close();
    expect(repository.saveLibrary({ ...saved, items: [] }).revision).toBe(2);
  });
  it("imports append fresh IDs even on collisions and never overwrite existing metadata", async () => {
    repository.saveLibrary({
      ...emptyLibrary(),
      items: [item("same", { content: "keep", useCount: 9 })],
    });
    const imported = {
      ...emptyLibrary(),
      items: [item("same", { content: "imported", tags: ["new"] })],
    };
    const response = await call("/api/library/import", "POST", {
      library: imported,
    });
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.revision).toBe(2);
    expect(result.items[0].content).toBe("keep");
    expect(result.items[0].useCount).toBe(9);
    expect(result.items[1].id).not.toBe("same");
    expect(result.items[1].tags).toEqual(["new"]);
    expect(
      (await call("/api/library/import", "POST", { library: {} })).status,
    ).toBe(400);
  });
  it("migrates an existing database without changing documents", () => {
    const doc = repository.create("existing", "Unchanged.");
    repository.close();
    repository = new Repository(dir);
    expect(repository.get(doc.id)).toEqual(doc);
    expect(repository.getLibrary()).toEqual(emptyLibrary());
    const other = new Repository(dir);
    repository.saveLibrary(emptyLibrary());
    expect(() => other.saveLibrary(emptyLibrary())).toThrow(/changed/);
    other.close();
  });
});

describe("one server-owned style enrichment", () => {
  it("legacy provider receives stored matching data, current instructions win and AI never writes observations", async () => {
    const request = fixture();
    repository.saveLibrary({
      ...emptyLibrary(),
      items: [
        item("hook", {
          kind: "style_rule",
          sectionKinds: ["Hook"],
          ruleKey: "rhythm",
          content: "hook",
        }),
        item("segue", {
          kind: "style_rule",
          sectionKinds: ["Segue"],
          ruleKey: "rhythm",
          content: "wrong section",
        }),
        item("audience", {
          audiences: ["engineer"],
          content: "wrong exact audience",
        }),
        item("favorite", {
          kind: "connector",
          preference: "like",
          audiences: ["Engineers"],
        }),
      ],
    });
    const before = repository.getLibrary();
    request.readContext.personalLibrary = {
      ...emptyLibrary(),
      items: [item("spoof")],
    };
    request.readContext.resolvedStyle = {
      effective: { rhythm: { value: "spoof", source: "current_instruction" } },
      layers: [],
      avoidedLibraryItems: [],
    };
    const spy = vi.spyOn(provider, "run");
    expect((await call("/api/ai", "POST", request)).status).toBe(200);
    const sent = spy.mock.calls[0][0];
    expect(sent.readContext.personalLibrary?.items.map((i) => i.id)).toEqual([
      "favorite",
      "hook",
    ]);
    expect(sent.readContext.resolvedStyle?.effective.rhythm.value).toBe(
      "current",
    );
    expect(sent.readContext.resolvedStyle?.layers[1].text).toBe(
      "rhythm: section note",
    );
    expect(repository.getLibrary()).toEqual(before);
  });
  it("uses draft register before baseline, ANDs scopes, and bounds mechanically sorted disclosure", () => {
    const request = fixture();
    request.readContext.styleDNA.register = "formal";
    repository.saveLibrary({
      ...emptyLibrary(),
      items: [
        item("technical", { register: "technical" }),
        ...Array.from({ length: 80 }, (_, i) => item(`r${i}`)),
      ],
    });
    request.structure = {
      mode: "analyze",
      draft: {
        raw: "",
        units: [],
        thoughtA: "A",
        thoughtB: "B",
        optionalSlot: "",
        relationship: "contrast",
        register: "technical",
        connectorId: "",
        scaffoldId: "",
        purpose: "qualifier",
      },
      scaffold: "[X], but [Y]",
      preview: "A, but B",
    };
    const result = enrichWritingRequest(request, repository);
    expect(
      result.readContext.personalLibrary!.items.length,
    ).toBeLessThanOrEqual(50);
    expect(result.readContext.personalLibrary!.items.map((i) => i.id)).toEqual(
      result.readContext
        .personalLibrary!.items.map((i) => i.id)
        .sort((a, b) => a.localeCompare(b)),
    );
    repository.saveLibrary({
      ...repository.getLibrary(),
      items: [
        item("technical", {
          register: "technical",
          audiences: ["Engineers"],
          sectionKinds: ["Hook"],
        }),
      ],
    });
    expect(
      enrichWritingRequest(request, repository).readContext.personalLibrary
        ?.items,
    ).toHaveLength(1);
    request.structure.draft.register = "formal";
    expect(
      enrichWritingRequest(request, repository).readContext.personalLibrary
        ?.items,
    ).toHaveLength(0);
  });
  it("effective phrase keys override baseline but connector avoidance has exact word boundaries and style prose is not a ban", () => {
    const request = fixture();
    request.readContext.styleDNA.neverSuggest = ["formerly banned"];
    request.instruction = "neverSuggest: different phrase";
    repository.saveLibrary({
      ...emptyLibrary(),
      items: [
        item("avoid-so", {
          kind: "connector",
          preference: "avoid",
          content: "so",
        }),
        item("style", {
          kind: "style_rule",
          preference: "avoid",
          content: "sentence",
        }),
      ],
    });
    const enriched = enrichWritingRequest(request, repository);
    expect(forbiddenPhrases(enriched)).not.toContain("formerly banned");
    expect(proposalViolation(enriched, "some sentence")).toBeUndefined();
    expect(proposalViolation(enriched, "so it goes")).toMatch(/connector/);
    expect(proposalViolation(enriched, "different phrase")).toMatch(
      /forbidden/,
    );
  });
  it("registry and compare both enrich from stored library without accepting spoofed layers", async () => {
    repository.saveLibrary({
      ...emptyLibrary(),
      items: [
        item("stored", {
          kind: "style_rule",
          ruleKey: "humor",
          content: "dry",
        }),
      ],
    });
    const spy = vi.spyOn(MockProvider.prototype, "run");
    const registry = new ProviderRegistry({ repository, env: {} });
    await registry.run(fixture());
    expect(
      spy.mock.calls.at(-1)![0].readContext.resolvedStyle?.effective.humor
        .value,
    ).toBe("dry");
    const reads = vi.spyOn(repository, "getLibrary");
    const response = await call("/api/ai/compare", "POST", {
      request: fixture(),
      models: [
        { providerId: "mock", modelId: "conservative" },
        { providerId: "mock", modelId: "plain" },
      ],
    });
    expect(response.status).toBe(200);
    expect(
      (await response.json()).results.every((r: any) => !!r.response),
    ).toBe(true);
    expect(
      spy.mock.calls
        .slice(-2)
        .every(
          ([r]) => r.readContext.personalLibrary?.items[0].id === "stored",
        ),
    ).toBe(true);
    expect(reads).toHaveBeenCalledTimes(1);
    reads.mockRestore();
    spy.mockRestore();
  });
});
