import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aiRequestSchema,
  defaultSettings,
  documentTarget,
  emptyLibrary,
  emptyStructure,
  libraryItemSchema,
  newDocument,
  targetFor,
  type AIResponse,
} from "../packages/domain/src/index";
import { MockProvider } from "../apps/server/src/mock-provider";
import {
  OpenAIProvider,
  type OpenAIClient,
} from "../apps/server/src/openai-provider";
import { ProviderRegistry } from "../apps/server/src/provider-registry";
import { Repository } from "../apps/server/src/repository";
import { enrichWritingRequest } from "../apps/server/src/writing-context";
import {
  developerInstructions,
  proposalViolation,
  validateProviderResponse,
  validateWritingRequest,
} from "../apps/server/src/provider-policy";
function fixture(mode: "analyze" | "critique" | "tighten" = "analyze") {
  const document = newDocument(
    "my thoughts",
    "The tool helps. The price is high.",
  );
  document.brief.audience = "My team";
  const draft = {
    ...emptyStructure(),
    raw: "The tool really helps. The price is high.",
    thoughtA: "The tool really helps",
    thoughtB: "the price is high",
    relationship: "contrast" as const,
    scaffoldId: "custom-exact",
    optionalSlot: "",
    purpose: "qualifier" as const,
  };
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: defaultSettings().styleDNA,
      knowledgePacks: [],
      approvedLanguage: [],
    },
    editTarget: targetFor(document, document.sections[0].id),
    action: "structure",
    stage: mode === "tighten" ? "propose" : "diagnose",
    answer: mode === "tighten" ? "Use my assembled preview" : "",
    structure: {
      mode,
      draft,
      scaffold: "[X], but [Y].",
      preview: "The tool really helps, but the price is high.",
    },
  });
}
function response(text?: string): AIResponse {
  return {
    provider: "openai",
    diagnosis: "Relationship inspection",
    mechanism: "Contrast human thoughts",
    question: "Is this the intended contrast?",
    missingIngredients: [],
    lexical: [],
    findings: [],
    proposals: text
      ? [
          {
            id: "p",
            text,
            label: "Trim",
            explanation: "Conservative trim of supplied preview",
          },
        ]
      : [],
  };
}

describe("shared structure operation", () => {
  it.each(["analyze", "critique"] as const)(
    "%s describes the chosen relationship and custom scaffold without polished proposals",
    async (mode) => {
      const request = fixture(mode);
      const result = await new MockProvider().run(request);
      expect(result.proposals).toEqual([]);
      expect(result.diagnosis).toContain("OFFLINE");
      expect(result.diagnosis).toContain("contrast");
      expect(result.mechanism).toContain("[X], but [Y].");
      expect(result.findings[0].detail).toContain("custom-exact");
      expect(result.question).toContain("My team");
      request.stage = "propose";
      expect(() =>
        validateProviderResponse(
          request,
          response("Invented rewrite"),
          "openai",
        ),
      ).toThrow(/diagnosis-only/);
    },
  );
  it("permits document analysis but retains local edit constraints for tightening", async () => {
    const request = fixture();
    request.editTarget = documentTarget(request.readContext.document);
    expect((await new MockProvider().run(request)).proposals).toEqual([]);
    request.structure!.mode = "tighten";
    request.stage = "propose";
    request.answer = "My preview";
    expect(() => validateWritingRequest(request)).toThrow(/Document scope/);
  });
  it("requires explicit propose, both human slots, preview and no placeholders", () => {
    const valid = fixture("tighten");
    expect(() => validateWritingRequest(valid)).not.toThrow();
    const missingA = structuredClone(valid);
    missingA.structure!.draft.thoughtA = "";
    const missingB = structuredClone(valid);
    missingB.structure!.draft.thoughtB = "  ";
    const placeholder = structuredClone(valid);
    placeholder.structure!.preview = "[X], but [Y].";
    const stage = structuredClone(valid);
    stage.stage = "diagnose";
    const empty = structuredClone(valid);
    empty.structure!.preview = "";
    for (const request of [missingA, missingB, placeholder, stage, empty])
      expect(() => validateWritingRequest(request)).toThrow();
  });
  it("offline tightening only trims the human preview and never modifies the canonical document", async () => {
    const request = fixture("tighten");
    const before = structuredClone(request.readContext.document);
    const result = await new MockProvider().run(request);
    expect(result.proposals[0].text).toBe(
      "The tool helps, but the price is high.",
    );
    expect(request.readContext.document).toEqual(before);
    expect(
      proposalViolation(request, "The tool helps every customer."),
    ).toMatch(/invented/);
    expect(proposalViolation(request, "[X]")).toMatch(/placeholders/);
    request.structure!.preview = "The tool helps, but the price is high.";
    expect((await new MockProvider().run(request)).proposals[0].label).toMatch(
      /unchanged/,
    );
  });
  it("preserves quotes and leaves source/security protections above style preferences", () => {
    const request = fixture("tighten");
    request.structure!.preview =
      'The tool says "really useful", but the price is high.';
    expect(
      proposalViolation(
        request,
        'The tool says "useful", but the price is high.',
      ),
    ).toMatch(/quote/);
    expect(developerInstructions).toContain("non-negotiable");
    expect(developerInstructions).toContain(
      "current instruction > active section notes",
    );
    expect(developerInstructions).toContain("not automatic insertions");
  });
  it("OpenAI SDK injection gets STRUCTURE and bounded stored style through one client, no live credential", async () => {
    const payloads: any[] = [];
    const client = {
      responses: {
        parse: vi.fn(async (payload: any) => {
          payloads.push(payload);
          return { output_parsed: response() };
        }),
        create: vi.fn(),
      },
    } as unknown as OpenAIClient;
    const dir = mkdtempSync(join(tmpdir(), "structure-sdk-"));
    const repository = new Repository(dir);
    try {
      repository.saveLibrary({
        ...emptyLibrary(),
        items: [
          libraryItemSchema.parse({
            id: "rule",
            kind: "style_rule",
            title: "Voice",
            content: "Keep fragments",
            ruleKey: "fragments",
            createdAt: "now",
            updatedAt: "now",
          }),
        ],
      });
      const request = enrichWritingRequest(fixture(), repository);
      await new OpenAIProvider({
        apiKey: "test-only-never-network",
        client,
      }).run(request);
      expect(client.responses.parse).toHaveBeenCalledTimes(1);
      expect(client.responses.create).not.toHaveBeenCalled();
      const data = JSON.parse(payloads[0].input[1].content);
      expect(data.STRUCTURE).toEqual(request.structure);
      expect(data.EDIT_TARGET).toEqual(request.editTarget);
      expect(data.READ_CONTEXT.resolvedStyle.effective.fragments.value).toBe(
        "Keep fragments",
      );
      expect(
        data.READ_CONTEXT.personalLibrary.items.map((i: any) => i.id),
      ).toEqual(["rule"]);
      expect(payloads[0].store).toBe(false);
      expect(JSON.stringify(payloads)).not.toContain("test-only-never-network");
    } finally {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("registry resolves task=structure using the existing shared service", async () => {
    const dir = mkdtempSync(join(tmpdir(), "structure-route-"));
    const repository = new Repository(dir);
    try {
      const settings = repository.getSettings();
      settings.routing = {
        taskDefaults: { structure: { providerId: "mock", modelId: "plain" } },
        applicationDefault: null,
        sectionTypeDefaults: {},
      };
      repository.saveSettings(settings);
      const registry = new ProviderRegistry({ repository, env: {} });
      const result = await registry.run(fixture());
      expect(result.model).toEqual({ providerId: "mock", modelId: "plain" });
      expect(result.proposals).toEqual([]);
    } finally {
      repository.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
