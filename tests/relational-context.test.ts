import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  aiRequestSchema,
  defaultSettings,
  documentSchema,
  documentTarget,
  emptyWorkbench,
  newDocument,
  newSection,
  sectionText,
  targetFor,
  validateTarget,
  type AIRequest,
  type AIResponse,
} from "../packages/domain/src/index";
import { relationalContext } from "../apps/server/src/writing-context";
import { MockProvider } from "../apps/server/src/mock-provider";
import { OpenAIProvider } from "../apps/server/src/openai-provider";
import { ProviderRegistry } from "../apps/server/src/provider-registry";
import { Repository } from "../apps/server/src/repository";
import {
  developerInstructions,
  validateWritingRequest,
} from "../apps/server/src/provider-policy";

function request(): AIRequest {
  const document = newDocument("A human transition");
  document.sections = [
    newSection("Point", "We tried the smaller room."),
    newSection("Segue"),
    newSection("Point", "The meeting ended at noon."),
    newSection("Segue", "An unrelated later bridge."),
  ];
  document.sections[1].notes =
    "Carry the room observation into the timing without claiming causality.";
  const settings = defaultSettings();
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: settings.styleDNA,
      knowledgePacks: settings.knowledgePacks,
      approvedLanguage: [],
    },
    editTarget: targetFor(document, document.sections[1].id),
    action: "coach",
    stage: "diagnose",
    controls: {},
    variantCount: 2,
  });
}
function response(): AIResponse {
  return {
    provider: "openai",
    diagnosis: "An intentionally empty bridge.",
    mechanism: "Identify a relation without inventing causality.",
    question: "What real connection belongs here?",
    missingIngredients: [],
    findings: [],
    lexical: [],
    proposals: [],
  };
}
const { default: OpenAI } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("openai");
function transport() {
  const requests: Record<string, any>[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        id: "resp_relational",
        object: "response",
        created_at: 1,
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
          {
            type: "message",
            id: "msg_relational",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(response()),
                annotations: [],
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const apiKey = "sk-offline-contract-not-a-real-key";
  return {
    requests,
    fetch,
    apiKey,
    client: new OpenAI({ apiKey, fetch, maxRetries: 0 }),
  };
}

describe("derived relational read context", () => {
  it("finds actual neighboring instances by ID and rich sectionText, never kind or label", () => {
    const req = request();
    const sections = req.readContext.document.sections;
    sections[0].content = [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "First" },
          { type: "hardBreak" },
          { type: "text", text: "last" },
        ],
      },
    ];
    sections[0].notes = "Previous note";
    sections[2].notes = "Next note";
    const before = structuredClone(req);
    expect(relationalContext(req)).toEqual({
      previous: {
        sectionId: sections[0].id,
        index: 0,
        kind: "Point",
        role: "Point",
        label: "Point",
        notes: "Previous note",
        text: "First\nlast",
      },
      current: {
        sectionId: sections[1].id,
        index: 1,
        kind: "Segue",
        role: "Segue",
        label: "Segue",
        notes: sections[1].notes,
        text: "",
      },
      next: {
        sectionId: sections[2].id,
        index: 2,
        kind: "Point",
        role: "Point",
        label: "Point",
        notes: "Next note",
        text: sectionText(sections[2]),
      },
    });
    expect(req).toEqual(before);
    req.readContext.document.sections = [
      sections[2],
      sections[3],
      sections[1],
      sections[0],
    ];
    expect(relationalContext(req).previous?.sectionId).toBe(sections[3].id);
    expect(relationalContext(req).current?.index).toBe(2);
    expect(relationalContext(req).next?.sectionId).toBe(sections[0].id);
  });
  it("uses reader-order neighbors and excludes parked thoughts", () => {
    const req = request();
    const sections = req.readContext.document.sections;
    sections[2].placement = "parked";
    expect(relationalContext(req).previous?.sectionId).toBe(sections[0].id);
    expect(relationalContext(req).next?.sectionId).toBe(sections[3].id);
    req.editTarget = targetFor(req.readContext.document, sections[2].id);
    expect(relationalContext(req)).toEqual({
      previous: null,
      current: null,
      next: null,
    });
  });
  it("returns null at edges and for document or unknown targets rather than guessing", () => {
    const req = request(),
      doc = req.readContext.document;
    req.editTarget = targetFor(doc, doc.sections[0].id);
    expect(relationalContext(req).previous).toBeNull();
    req.editTarget = targetFor(doc, doc.sections.at(-1)!.id);
    expect(relationalContext(req).next).toBeNull();
    req.editTarget = documentTarget(doc);
    expect(relationalContext(req)).toEqual({
      previous: null,
      current: null,
      next: null,
    });
    req.editTarget.sectionId = "unknown";
    expect(relationalContext(req).next).toBeNull();
  });
  it("allows an empty section anchor and coaches its actual note and neighbors without candidates", async () => {
    const req = request(),
      before = structuredClone(req);
    expect(() =>
      validateTarget(req.readContext.document, req.editTarget),
    ).not.toThrow();
    expect(() => validateWritingRequest(req)).not.toThrow();
    const result = await new MockProvider().run(req);
    expect(result.proposals).toEqual([]);
    expect(result.missingIngredients).toEqual([]);
    expect(result.diagnosis).toContain("canonically empty");
    expect(result.mechanism).toContain(
      req.readContext.document.sections[1].notes,
    );
    expect(result.mechanism).toContain(
      sectionText(req.readContext.document.sections[0]),
    );
    expect(result.mechanism).toContain(
      sectionText(req.readContext.document.sections[2]),
    );
    expect(result.question).toContain("actual connection");
    expect(result.question).toContain("without claiming causality");
    expect(req).toEqual(before);
  });
  it("requires human material before creative proposals and keeps empty canonical text unchanged", async () => {
    const req = request();
    req.stage = "propose";
    await expect(new MockProvider().run(req)).rejects.toThrow("own material");
    req.answer = "We really moved on to timing.";
    const before = structuredClone(req);
    const provider = new MockProvider();
    const output = await provider.run(req);
    expect(output.proposals.map((p) => p.text)).toEqual([
      "We really moved on to timing.",
      "We moved on to timing.",
    ]);
    expect(output.proposals.map((p) => p.label)).toEqual([
      "Your supplied wording — verbatim",
      "Conservative trim",
    ]);
    expect(await provider.run(req)).toEqual(output);
    expect(req).toEqual(before);
    expect(sectionText(req.readContext.document.sections[1])).toBe("");
  });
  it("offers two human-furnished lines without borrowing neighbor content or inventing differences", async () => {
    const req = request();
    req.stage = "propose";
    req.answer =
      "Material: Timing was my next concern.\nI turned to the timing.";
    const result = await new MockProvider().run(req);
    expect(result.proposals.map((p) => p.text)).toEqual([
      "Timing was my next concern.",
      "I turned to the timing.",
    ]);
    req.answer = "Timing matters.";
    expect((await new MockProvider().run(req)).proposals).toHaveLength(1);
  });
  it("does not introduce a parallel provider or response schema; real SDK serialization includes explicit read-only context", async () => {
    const req = request(),
      h = transport();
    const before = structuredClone(req);
    const provider = new OpenAIProvider({
      apiKey: h.apiKey,
      client: h.client,
      model: "contract-model",
    });
    expect(await provider.run(req)).toEqual(response());
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const wire = h.requests[0];
    const payload = JSON.parse(wire.input[1].content);
    expect(payload.READ_CONTEXT.RELATIONAL_CONTEXT).toEqual(
      relationalContext(req),
    );
    expect(payload.EDIT_TARGET).toEqual(req.editTarget);
    expect(payload.LOCAL_WORKBENCH_SECTION_ID).toBe(req.editTarget.sectionId);
    expect(payload.READ_CONTEXT.document.sources).toEqual(
      req.readContext.document.sources,
    );
    expect(wire.input[0].content).toBe(developerInstructions);
    expect(wire.input[0].content).toContain(
      "canonically empty, NOT missing source data",
    );
    expect(wire.text.format.name).toBe("writing_response");
    expect(wire.store).toBe(false);
    expect(wire.tools).toBeUndefined();
    expect(req).toEqual(before);
  });
  it("comparison reuses one injected SDK client and identical relational/style context without writes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relational-compare-"));
    const repository = new Repository(dir);
    try {
      const h = transport();
      const registry = new ProviderRegistry({
        repository,
        env: { OPENAI_API_KEY: h.apiKey },
        client: h.client,
      });
      registry.addModel("openai", "first");
      registry.addModel("openai", "second");
      const req = request(),
        before = structuredClone(req);
      const results = await registry.compare(
        req,
        ["first", "second"].map((modelId) => ({
          providerId: "openai",
          modelId,
        })),
      );
      expect(results.every((result) => "response" in result)).toBe(true);
      expect(h.fetch).toHaveBeenCalledTimes(2);
      const [a, b] = h.requests.map((wire) =>
        JSON.parse(wire.input[1].content),
      );
      expect(a.READ_CONTEXT).toEqual(b.READ_CONTEXT);
      expect(a.READ_CONTEXT.RELATIONAL_CONTEXT).toEqual(relationalContext(req));
      expect(a.EDIT_TARGET).toEqual(b.EDIT_TARGET);
      expect(req).toEqual(before);
      expect(repository.list()).toEqual([]);
      expect(repository.getLibrary().revision).toBe(0);
    } finally {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("restart and import preserve local context identities", () => {
  it("persists layout/focus/models/drafts in existing JSON and remaps all imported targets while keeping coordinate keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "relational-persistence-"));
    let repository = new Repository(dir);
    try {
      let doc = repository.create("Persistent", "Alpha beta");
      doc.sections.push(
        newSection("Segue"),
        newSection("Point", "Other material"),
      );
      doc.focusTarget = targetFor(doc, doc.sections[0].id, "word", 0, 5);
      doc.sections[0].modelOverride = { providerId: "mock", modelId: "plain" };
      const target = doc.focusTarget;
      const key = JSON.stringify([
        target.scope,
        target.start,
        target.end,
        target.text,
      ]);
      doc.sections[0].workbench = {
        ...emptyWorkbench(),
        oneOffModel: { providerId: "mock", modelId: "conservative" },
        targetDrafts: {
          [key]: {
            target,
            instruction: "Local instruction",
            answer: "Local answer",
          },
        },
      };
      const otherTarget = targetFor(doc, doc.sections[2].id, "selection", 0, 5);
      const otherKey = JSON.stringify([
        otherTarget.scope,
        otherTarget.start,
        otherTarget.end,
        otherTarget.text,
      ]);
      doc.sections[2].workbench = {
        ...emptyWorkbench(),
        targetDrafts: {
          [otherKey]: {
            target: otherTarget,
            instruction: "Other instruction",
            answer: "Other answer",
          },
        },
      };
      doc.workbench = {
        ...emptyWorkbench(),
        targetDrafts: {
          [key]: {
            target,
            instruction: "Document-local note",
            answer: "Document-local answer",
          },
        },
      };
      const settings = defaultSettings();
      settings.layout = {
        primaryView: "document",
        density: "overview",
        previewVisible: false,
        inspectorVisible: false,
      };
      repository.saveSettings(settings);
      doc = repository.save(doc.id, doc);
      repository.close();
      repository = new Repository(dir);
      const restarted = repository.get(doc.id);
      expect(documentSchema.parse(restarted)).toEqual(doc);
      expect(repository.getSettings().layout).toEqual(settings.layout);
      expect(() =>
        validateTarget(restarted, restarted.focusTarget!),
      ).not.toThrow();
      const imported = repository.import(restarted);
      expect(documentSchema.parse(imported)).toEqual(imported);
      expect(imported.id).not.toBe(doc.id);
      expect(imported.focusTarget?.sectionId).toBe(imported.sections[0].id);
      expect(imported.focusTarget?.documentId).toBe(imported.id);
      expect(imported.focusTarget?.documentRevision).toBe(0);
      expect(() =>
        validateTarget(imported, imported.focusTarget!),
      ).not.toThrow();
      expect(imported.sections[0].modelOverride).toEqual(
        doc.sections[0].modelOverride,
      );
      expect(imported.sections[0].workbench?.oneOffModel).toEqual(
        doc.sections[0].workbench?.oneOffModel,
      );
      for (const wb of [
        imported.workbench,
        ...imported.sections.map((section) => section.workbench),
      ]) {
        for (const [draftKey, draft] of Object.entries(
          wb?.targetDrafts ?? {},
        )) {
          expect(draft.target.documentId).toBe(imported.id);
          expect(draft.target.documentRevision).toBe(0);
          expect(
            imported.sections.some(
              (section) => section.id === draft.target.sectionId,
            ),
          ).toBe(true);
          expect(draftKey).toBe(
            JSON.stringify([
              draft.target.scope,
              draft.target.start,
              draft.target.end,
              draft.target.text,
            ]),
          );
          expect(() => validateTarget(imported, draft.target)).not.toThrow();
        }
      }
      expect(imported.sections[0].workbench?.targetDrafts?.[key].answer).toBe(
        "Local answer",
      );
      expect(sectionText(imported.sections[1])).toBe("");
      expect(repository.get(doc.id)).toEqual(restarted);
    } finally {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
