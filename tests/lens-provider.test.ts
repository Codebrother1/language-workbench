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

describe("Delivery Lens as interpretation, not correction", () => {
  const delivery = (
    text: string,
    instruction = "Explain what the delivery does.",
  ) => {
    const input = fixture(text, text);
    input.editTarget.scope = "selection";
    input.lens = {
      ...input.lens!,
      view: "delivery",
      mode: "explore",
      shape: "expression",
    };
    input.stage = "diagnose";
    input.instruction = instruction;
    return input;
  };
  it.each([
    ["Dre, please.", /deadpan|final/i],
    ["Dre, please!", /intensity|volume/i],
    ["I knew it was fake... but still.", /hesitat|withhold/i],
    ["I knew it was fake; I wore it anyway.", /compos|relation/i],
    ["I knew it was fake — and that was almost the point.", /pivot|turn/i],
    ["this is ridiculous", /lowercase|casual/i],
    ["THIS IS RIDICULOUS", /emphasis|volume/i],
    ["The Receipt Problem", /label|category|slogan/i],
    [
      "he looked at the shoe looked at me looked back at the shoe",
      /speed|flow/i,
    ],
    ["He lost the receipt. Again.", /again|timing|attitude/i],
    ["Wait, now", /comma|breath/i],
    ["The problem: the receipt.", /colon|setup/i],
    ["(of course) he did", /parentheses|aside/i],
    ["Why?", /question mark|invitation/i],
    ["iPhone?!", /mixed casing|stylized/i],
  ])(
    "interprets %s without calling its delivery wrong",
    async (text, effect) => {
      const request = delivery(text);
      const before = structuredClone(request.readContext.document);
      const result = await new MockProvider().run(request);
      expect([result.diagnosis, result.mechanism].join(" ")).toMatch(effect);
      expect([result.diagnosis, result.mechanism].join(" ")).not.toMatch(
        /incorrect|you should fix|grammar error/i,
      );
      expect(result.proposals).toEqual([]);
      expect(result.lexical).toEqual([]);
      expect(request.readContext.document).toEqual(before);
    },
  );
  it("asks about timing rather than declaring an emotion, and about casing rather than correcting it", async () => {
    const timing = await new MockProvider().run(
      delivery("He lost the receipt. Again."),
    );
    expect(timing.question).toContain("words, the timing, or both");
    const casing = await new MockProvider().run(
      delivery("The Receipt Problem"),
    );
    expect(casing.question).toContain("casing a label");
  });
  it("uses at most one optional punctuation-only contrast and keeps the original prose", async () => {
    const request = delivery("Dre, please.", "What if this ended louder?");
    const result = await new MockProvider().run(request);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].title).toContain("Dre, please!");
    expect(result.findings[0].title.match(/[\p{L}\p{N}]+/gu)).toEqual([
      "Contrast",
      "Dre",
      "please",
    ]);
    expect(result.proposals).toEqual([]);
    const dash = await new MockProvider().run(
      delivery(
        "I knew it was fake — and that was almost the point.",
        "What if the pause were lighter?",
      ),
    );
    expect(dash.findings[0].title).toContain("fake, and");
    expect(dash.findings[0].title).not.toContain("fake ,");
    const ellipsis = await new MockProvider().run(
      delivery(
        "I knew it was fake... but still.",
        "What if the pause were a turn?",
      ),
    );
    expect(ellipsis.findings[0].title).toContain("fake — but");
    expect(request.readContext.document.sections[0].content).toEqual(
      newDocument("draft", "Dre, please.").sections[0].content,
    );
  });
  it("filters a model contrast that changes the words and keeps the analysis", async () => {
    const request = delivery("Dre, please.", "What if this ended louder?");
    const raw = {
      ...response(),
      diagnosis: "The period in Dre, please. can read as deadpan closure.",
      mechanism: "The stop makes the request feel final.",
      question: "Does that finality fit?",
      findings: [
        {
          sectionId: request.editTarget.sectionId,
          title: "Contrast: Dre, go away!",
          detail: "Louder.",
          severity: "note",
        },
      ],
    };
    const h = harness(raw);
    const result = await h.provider.run(request);
    expect(h.payloads[0].input[0].content).toContain("DELIVERY LENS");
    expect(JSON.parse(h.payloads[0].input[1].content).lens.view).toBe(
      "delivery",
    );
    expect(result.diagnosis).toContain("deadpan closure");
    expect(result.findings).toEqual([]);
    expect(result.qualityNotices?.join(" ")).toContain("changed the wording");
    expect(result.proposals).toEqual([]);
  });
  it("rejects delivery proposals and requires a bounded local analysis target", () => {
    const request = delivery("Dre, please.");
    expect(() =>
      validateProviderResponse(request, response("Dre, please!"), "openai"),
    ).toThrow(/diagnosis-only/);
    expect(() =>
      validateProviderResponse(
        request,
        {
          ...response(),
          lexical: [
            {
              term: "different",
              meaning: "a word",
              nuance: "new",
              register: "plain",
              example: "different",
            },
          ],
        },
        "openai",
      ),
    ).toThrow(/lexical substitutions/);
    request.editTarget = documentTarget(request.readContext.document);
    expect(() => validateWritingRequest(request)).toThrow(
      /bounded local|Document scope/,
    );
    const replacement = delivery("Dre, please.");
    replacement.stage = "propose";
    replacement.lens!.mode = "replace";
    expect(() => validateWritingRequest(replacement)).toThrow(/analysis-only/);
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
