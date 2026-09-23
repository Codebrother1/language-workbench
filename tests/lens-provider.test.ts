import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  aiRequestSchema,
  aiResponseSchema,
  defaultSettings,
  newDocument,
  targetFor,
  documentTarget,
  emptyWorkbench,
  type AIRequest,
  type AIResponse,
} from "../packages/domain/src/index";
import { MockProvider } from "../apps/server/src/mock-provider";
import { OpenAIProvider } from "../apps/server/src/openai-provider";
import {
  developerInstructions,
  proposalViolation,
  protectedSurrounding,
  validateProviderResponse,
  validateWritingRequest,
} from "../apps/server/src/provider-policy";
const { default: OpenAI } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("openai");
function fixture(
  text = "They were larping as experts.",
  term = "larping",
): AIRequest {
  const document = newDocument("draft", text);
  const settings = defaultSettings();
  const start = text.indexOf(term);
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: settings.styleDNA,
      knowledgePacks: settings.knowledgePacks,
      approvedLanguage: [],
    },
    editTarget: {
      ...targetFor(document, document.sections[0].id),
      scope: "word",
      start,
      end: start + term.length,
      text: term,
    },
    action: "words",
    stage: "propose",
    instruction:
      "Use plainer language without changing the surrounding sentence.",
    lens: {
      mode: "replace",
      shape: "word",
      fidelity: "balanced",
      intent: "Clearer",
      persona: "",
      technical: false,
    },
    variantCount: 5,
  });
}
function response(text?: string): AIResponse {
  return {
    provider: "openai",
    diagnosis: "Local lexical choice",
    mechanism: "Preserve surrounding text",
    question: "",
    missingIngredients: [],
    findings: [],
    lexical: [],
    proposals: text
      ? [
          {
            id: "p",
            label: "preview",
            text,
            explanation: "A change in connotation.",
          },
        ]
      : [],
  };
}
function harness(result: unknown) {
  const payloads: any[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    payloads.push(JSON.parse(String(init.body)));
    return new Response(
      JSON.stringify({
        id: "resp",
        object: "response",
        created_at: 1,
        status: "completed",
        output: [
          {
            type: "message",
            id: "msg",
            role: "assistant",
            status: "completed",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(result),
                annotations: [],
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  const provider = new OpenAIProvider({
    apiKey: "sk-fake-private",
    model: "test-model",
    client: new OpenAI({ apiKey: "sk-fake-private", fetch, maxRetries: 0 }),
  });
  return { provider, payloads, fetch };
}

describe("bounded lexical lens policy", () => {
  it("requires a local bounded word/selection rather than granting section/document authority", () => {
    const input = fixture();
    expect(() => validateWritingRequest(input)).not.toThrow();
    input.editTarget = targetFor(
      input.readContext.document,
      input.readContext.document.sections[0].id,
    );
    expect(() => validateWritingRequest(input)).toThrow(/bounded local/);
    input.editTarget = documentTarget(input.readContext.document);
    expect(() => validateWritingRequest(input)).toThrow();
    const huge = fixture("x ".repeat(25).trim(), "x ".repeat(25).trim());
    huge.editTarget.scope = "selection";
    expect(() => validateWritingRequest(huge)).toThrow(/bounded local/);
  });
  it("allows lexical replace immediately without an interview, preserving the generic proposal requirement otherwise", async () => {
    const input = fixture();
    input.action = "coach";
    input.answer = "";
    expect(() => validateWritingRequest(input)).not.toThrow();
    expect(
      (await new MockProvider().run(input)).proposals.length,
    ).toBeGreaterThan(0);
    delete input.lens;
    expect(() => validateWritingRequest(input)).toThrow(/own material/);
  });
  it("only relaxes baseline word scope when an explicit phrase/expression lens permits it", () => {
    const input = fixture();
    delete input.lens;
    expect(proposalViolation(input, "playing at being")).toContain(
      "Word target",
    );
    input.lens = fixture().lens;
    expect(proposalViolation(input, "playing at being")).toContain("shape");
    input.lens!.shape = "phrase";
    expect(proposalViolation(input, "playing at being")).toBeUndefined();
    expect(
      proposalViolation(input, "one two three four five six seven eight nine"),
    ).toContain("shape");
    input.lens!.shape = "expression";
    expect(
      proposalViolation(input, "one two three four five six seven eight nine"),
    ).toBeUndefined();
    expect(proposalViolation(input, "x ".repeat(25))).toContain("shape");
    expect(proposalViolation(input, "playing\nat being")).toContain("shape");
  });
  it("rejects returning protected sentence prefix/suffix or altering a protected quote", () => {
    const input = fixture();
    input.lens!.shape = "expression";
    expect(proposalViolation(input, "They were posturing")).toContain(
      "surrounding",
    );
    expect(proposalViolation(input, "posturing as experts.")).toContain(
      "surrounding",
    );
    expect(
      proposalViolation(fixture("I was larping.", "larping"), "pretending"),
    ).toBeUndefined();
    expect(
      proposalViolation(
        fixture('They said "larping" yesterday.', "larping"),
        "pretending",
      ),
    ).toContain("quote");
  });
  it("explore is analysis-only but old action words behavior remains backward-compatible", () => {
    const input = fixture();
    input.lens!.mode = "explore";
    expect(() =>
      validateProviderResponse(input, response("posturing"), "openai"),
    ).toThrow(/diagnosis-only/);
    delete input.lens;
    input.stage = "diagnose";
    expect(() =>
      validateProviderResponse(input, response("posturing"), "openai"),
    ).not.toThrow();
  });
  it("retains forbidden vocabulary, variant limits and response schema enforcement", () => {
    const input = fixture();
    input.readContext.styleDNA.neverSuggest = ["posturing"];
    expect(() =>
      validateProviderResponse(input, response("posturing"), "openai"),
    ).toThrow(/forbidden/);
    expect(() =>
      validateProviderResponse(
        input,
        { ...response(), lexical: [{ term: "guess" }] },
        "openai",
      ),
    ).toThrow();
    const raw = {
      ...response(),
      model: { providerId: "evil", modelId: "fake" },
      routeSource: "action",
    };
    expect(aiResponseSchema.parse(raw)).not.toHaveProperty("model");
    expect(aiResponseSchema.parse(raw)).not.toHaveProperty("routeSource");
  });
});

describe("honest offline lexical entries", () => {
  it("distinguishes larping alternatives and never writes the readable document", async () => {
    const input = fixture(),
      before = structuredClone(input);
    const result = await new MockProvider().run(input);
    expect(result.lexical.map((l) => l.term)).toEqual([
      "posturing",
      "pretending",
      "masquerading",
      "cosplaying",
    ]);
    expect(
      result.proposals.every((p) => p.text.split(/\s+/).length === 1),
    ).toBe(true);
    expect(new Set(result.lexical.map((l) => l.nuance)).size).toBe(4);
    expect(input).toEqual(before);
    expect(result.mechanism).toContain("no historical authenticity");
  });
  it("offers a phrase only under explicit phrase shape and plain model prioritizes the plain choice", async () => {
    const input = fixture();
    input.lens!.shape = "phrase";
    const result = await new MockProvider("plain").run(input);
    expect(result.lexical[0].term).toBe("pretending");
    expect(result.proposals.some((p) => p.text === "playing at being")).toBe(
      true,
    );
  });
  it("exact fidelity declines unsupported semantic guarantees; explore yields no proposals", async () => {
    const input = fixture();
    input.lens!.fidelity = "exact";
    const result = await new MockProvider().run(input);
    expect(result.proposals).toEqual([]);
    expect(result.missingIngredients.join(" ")).toContain("exact");
    input.lens!.mode = "explore";
    input.lens!.fidelity = "loose";
    expect((await new MockProvider().run(input)).proposals).toEqual([]);
  });
  it("does not fake dictionary coverage for an unknown target", async () => {
    const input = fixture("They were flibbering as experts.", "flibbering");
    const result = await new MockProvider().run(input);
    expect(result.lexical).toEqual([]);
    expect(result.proposals).toEqual([]);
    expect(result.diagnosis).toContain("No definition has been invented");
  });
});

describe("official OpenAI SDK lexical contract", () => {
  it("sends lens, technical/exact/persona instructions, surrounding boundaries and local workbench read-context while leaving structured output unchanged", async () => {
    const input = fixture();
    input.lens = {
      mode: "replace",
      fidelity: "exact",
      shape: "phrase",
      intent: "Technical",
      persona: "a precise technical editor",
      technical: true,
    };
    input.readContext.document.brief.audience = "engineers";
    input.readContext.document.sections[0].workbench = emptyWorkbench();
    input.readContext.document.sections[0].workbench!.instruction =
      "Local draft note";
    const h = harness(response("playing at being"));
    await h.provider.run(input);
    const payload = h.payloads[0],
      body = JSON.parse(payload.input[1].content);
    expect(body.lens).toEqual(input.lens);
    expect(body.PROTECTED_SURROUNDING).toEqual(protectedSurrounding(input));
    expect(body.READ_CONTEXT.document.sections[0].workbench.instruction).toBe(
      "Local draft note",
    );
    expect(payload.input[0].content).toBe(developerInstructions);
    expect(developerInstructions).toContain("exact fidelity preserves meaning");
    expect(developerInstructions).toContain(
      "natural-language instruction is the primary direction",
    );
    expect(payload.text.format.schema.properties).not.toHaveProperty("model");
    expect(payload.text.format.schema.properties).not.toHaveProperty(
      "routeSource",
    );
  });
  it("rejects a wider-scope model completion instead of trimming and silently applying it", async () => {
    const input = fixture();
    input.lens!.shape = "expression";
    const h = harness(response("They were posturing as experts."));
    await expect(h.provider.run(input)).rejects.toThrow(
      /protected surrounding/,
    );
  });
  it("rejects proposals for explore at the real parser/policy boundary", async () => {
    const input = fixture();
    input.lens!.mode = "explore";
    await expect(
      harness(response("posturing")).provider.run(input),
    ).rejects.toThrow(/diagnosis-only/);
  });
});
