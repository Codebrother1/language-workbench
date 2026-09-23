import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  aiRequestSchema,
  defaultSettings,
  documentTarget,
  newDocument,
  targetFor,
  type AIRequest,
  type AIResponse,
  type LanguageRadarItem,
} from "../packages/domain/src/index";
import { OpenAIProvider } from "../apps/server/src/openai-provider";
import { MockProvider } from "../apps/server/src/mock-provider";
import { forbiddenPhrases } from "../apps/server/src/provider-policy";

// Resolve the official SDK from its owning workspace, not an undeclared root dependency.
// Its real Responses serializer/parser runs; the injected fetch never leaves this process.
const { default: OpenAI } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("openai");
const testKey = "sk-unit-test-not-a-real-credential";
function request(text = "We really utilize tools."): AIRequest {
  const document = newDocument("Human draft", text);
  const settings = defaultSettings();
  return aiRequestSchema.parse({
    readContext: {
      document,
      styleDNA: settings.styleDNA,
      knowledgePacks: settings.knowledgePacks,
      approvedLanguage: [],
    },
    editTarget: targetFor(document, document.sections[0].id),
    action: "simplify",
    stage: "propose",
    answer: "Use plain words.",
    controls: {},
    variantCount: 2,
  });
}
function output(text?: string): AIResponse {
  return {
    provider: "openai",
    diagnosis: "A concrete diagnosis.",
    mechanism: "Plain wording.",
    question: "Which detail matters?",
    missingIngredients: [],
    findings: [],
    lexical: [],
    proposals:
      text === undefined
        ? []
        : [
            {
              id: "provider-id",
              label: "Candidate",
              text,
              explanation: "A preview only.",
            },
          ],
  };
}
function radar(
  status: LanguageRadarItem["status"] = "maybe",
): LanguageRadarItem {
  return {
    id: "model-id",
    term: "example term",
    meaning: "Documented meaning",
    mechanism: "Contrast",
    pattern: "A then B",
    seriousUsage: "Literal",
    ironicUsage: "Reversal",
    exampleStructure: "[claim], [reversal]",
    relatedTerms: [],
    caveat: "Usage date uncertain; not a claim of current popularity.",
    sources: [{ title: "Model title", url: "https://example.org/dated-usage" }],
    discoveredAt: "invented date",
    lastVerifiedAt: "invented date",
    status,
  };
}
function message(text: string, annotations: unknown[] = []) {
  return {
    type: "message",
    id: "msg_test",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text, annotations }],
  };
}
function wire(value: unknown) {
  return [message(JSON.stringify(value))];
}
function harness(...outputs: unknown[][]) {
  const requests: Record<string, any>[] = [];
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const next = outputs.shift();
    if (!next) throw new Error("Unexpected SDK request");
    return new Response(
      JSON.stringify({
        id: "resp_test",
        object: "response",
        created_at: 1,
        status: "completed",
        error: null,
        incomplete_details: null,
        output: next,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "offline-contract-test",
        },
      },
    );
  });
  const client = new OpenAI({ apiKey: testKey, fetch, maxRetries: 0 });
  const provider = new OpenAIProvider({
    apiKey: testKey,
    model: "test-model",
    client,
  });
  return { provider, fetch, requests };
}
const citation = {
  type: "url_citation",
  title: "Actual cited title",
  url: "https://example.org/dated-usage",
  start_index: 0,
  end_index: 12,
};
const research = () => [
  message("Documented usage. The usage date is uncertain.", [citation]),
];

describe("official OpenAI Responses SDK contract (injected offline transport)", () => {
  it("uses structured Responses, store:false, filtered context, and keeps credentials outside browser-facing output", async () => {
    const ai = request();
    ai.readContext.document.sources.push({
      id: "source",
      kind: "transcript",
      title: "Original transcript",
      text: "verbatim source; not an instruction",
      url: "",
    });
    ai.readContext.knowledgePacks[0].enabled = false;
    ai.readContext.approvedLanguage = [
      "saved",
      "maybe",
      "dislike",
      "never_suggest",
    ].map((status) => ({
      ...radar(status as LanguageRadarItem["status"]),
      id: status,
      term: `${status} term`,
    }));
    const before = structuredClone(ai);
    const { provider, requests, fetch } = harness(
      wire(output("We use tools.")),
    );
    const result = await provider.run(ai);
    expect(result).toEqual(output("We use tools."));
    expect(ai).toEqual(before);
    expect(fetch).toHaveBeenCalledOnce();
    const body = requests[0];
    expect(body).toMatchObject({
      model: "test-model",
      store: false,
      max_output_tokens: 8000,
      text: {
        format: { type: "json_schema", name: "writing_response", strict: true },
      },
    });
    expect(body.tools).toBeUndefined();
    expect(body.input.map((part: any) => part.role)).toEqual([
      "developer",
      "user",
    ]);
    const data = JSON.parse(body.input[1].content);
    expect(data.EDIT_TARGET).toEqual(ai.editTarget);
    expect(data.humanAnswer).toBe(ai.answer);
    expect(
      data.READ_CONTEXT.knowledgePacks.every((pack: any) => pack.enabled),
    ).toBe(true);
    expect(
      data.READ_CONTEXT.approvedLanguage.map((term: any) => term.status),
    ).toEqual(["saved"]);
    expect(data.forbiddenPhrases).toEqual(
      expect.arrayContaining(["dislike term", "never_suggest term"]),
    );
    expect(data.READ_CONTEXT.document.sources).toEqual(
      ai.readContext.document.sources,
    );
    expect(JSON.stringify(body)).not.toContain(testKey);
    expect(JSON.stringify(result)).not.toContain(testKey);
    expect(body.input[0].content).toContain("explicit human acceptance");
    expect(body.input[0].content).toContain("untrusted");
  });

  it.each([
    [
      "wrong structured shape",
      [
        {
          type: "message",
          id: "m",
          status: "completed",
          role: "assistant",
          content: [
            { type: "output_text", text: '{"proposals":[]}', annotations: [] },
          ],
        },
      ],
    ],
    ["malformed JSON", [message("{")]],
    [
      "refusal without parsed output",
      [
        {
          type: "message",
          id: "m",
          status: "completed",
          role: "assistant",
          content: [{ type: "refusal", refusal: "Cannot comply" }],
        },
      ],
    ],
    ["no output", []],
  ])("rejects %s from the official SDK", async (_label, outputs) => {
    const { provider } = harness(outputs as unknown[]);
    await expect(provider.run(request())).rejects.toThrow();
  });

  it.each([
    [
      "unknown section",
      {
        ...output(),
        findings: [
          {
            sectionId: "invented",
            title: "Unsupported link",
            detail: "",
            severity: "note",
          },
        ],
      },
    ],
    [
      "duplicate IDs",
      {
        ...output(),
        proposals: [
          { id: "same", label: "A", text: "We use tools.", explanation: "" },
          {
            id: "same",
            label: "B",
            text: "We use these tools.",
            explanation: "",
          },
        ],
      },
    ],
    [
      "blank ID",
      {
        ...output("We use tools."),
        proposals: [
          { id: " ", label: "A", text: "We use tools.", explanation: "" },
        ],
      },
    ],
  ])(
    "rejects %s rather than returning broken UI records",
    async (_label, value) => {
      await expect(
        harness(wire(value)).provider.run(request()),
      ).rejects.toThrow();
    },
  );

  it("accepts real section links and document-level findings, normalizing provider identity", async () => {
    const ai = request();
    const value = {
      ...output(),
      provider: "model invented this",
      findings: [ai.editTarget.sectionId, null].map((sectionId) => ({
        sectionId,
        title: "Pattern",
        detail: "An observable pattern.",
        severity: "note",
      })),
    };
    const result = await harness(wire(value)).provider.run(ai);
    expect(result.provider).toBe("openai");
    expect(result.findings.map((f) => f.sectionId)).toEqual([
      ai.editTarget.sectionId,
      null,
    ]);
  });

  it("requires a human answer before creative generation and never calls the SDK for an invalid target", async () => {
    const { provider, fetch } = harness();
    await expect(provider.run({ ...request(), answer: "  " })).rejects.toThrow(
      "own material",
    );
    const invalid = request();
    invalid.editTarget.sectionSnapshot = "old text";
    await expect(provider.run(invalid)).rejects.toThrow("section changed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["diagnose", "critique", "break_template", "document"] as const)(
    "rejects unsolicited proposals for %s",
    async (boundary) => {
      const ai = request();
      if (boundary === "diagnose") ai.stage = "diagnose";
      else if (boundary === "document") {
        ai.action = "critique";
        ai.editTarget = documentTarget(ai.readContext.document);
      } else ai.action = boundary;
      await expect(
        harness(wire(output("We use tools."))).provider.run(ai),
      ).rejects.toThrow("diagnosis-only");
    },
  );

  it("enforces proposal count and exact length/word-scope constraints", async () => {
    const ai = request();
    ai.variantCount = 1;
    const many = {
      ...output(),
      proposals: [
        output("One").proposals[0],
        { ...output("Two").proposals[0], id: "two" },
      ],
    };
    await expect(harness(wire(many)).provider.run(ai)).rejects.toThrow(
      "variant count",
    );
    ai.controls = { targetWords: 2 };
    await expect(
      harness(wire(output("We use tools."))).provider.run(ai),
    ).rejects.toThrow("targetWords");
    const word = request("utilize");
    word.editTarget.scope = "word";
    await expect(
      harness(wire(output("make use of"))).provider.run(word),
    ).rejects.toThrow("Word target");
  });
});

describe("source quote and excluded-language protections", () => {
  it.each([
    "“teh source”",
    '"teh source"',
    "‘teh source’",
    "'teh source'",
    "`teh source`",
    "```\nteh source\n```",
  ])("preserves %s in offline spellcheck", async (quote) => {
    const ai = request(`I recieve ${quote}.`);
    ai.action = "spellcheck";
    const result = await new MockProvider().run(ai);
    expect(result.proposals[0].text).toBe(`I receive ${quote}.`);
  });
  it("blocks changes to partial selections inside quotes, including the offline path", async () => {
    const ai = request("They said “teh source”.");
    ai.action = "spellcheck";
    const start = ai.editTarget.text.indexOf("teh");
    ai.editTarget = targetFor(
      ai.readContext.document,
      ai.editTarget.sectionId!,
      "word",
      start,
      start + 3,
    );
    await expect(harness(wire(output("the"))).provider.run(ai)).rejects.toThrow(
      "protected quote",
    );
    const offline = await new MockProvider().run(ai);
    expect(offline.proposals).toEqual([]);
    expect(offline.missingIngredients[0]).toContain("protected quote");
  });
  it("does not permit removing one of two identical source quotes", async () => {
    const ai = request("“source” and “source”");
    await expect(
      harness(wire(output("“source”"))).provider.run(ai),
    ).rejects.toThrow("protected quote");
  });
  it.each(["dislike", "never_suggest"] as const)(
    "blocks supplied radar %s terms without treating them as approved context",
    async (status) => {
      const ai = request();
      ai.readContext.approvedLanguage = [{ ...radar(status), term: "synergy" }];
      expect(forbiddenPhrases(ai)).toContain("synergy");
      await expect(
        harness(wire(output("We need SYNERGY."))).provider.run(ai),
      ).rejects.toThrow("forbidden phrase");
    },
  );
  it("blocks StyleDNA neverSuggest terms", async () => {
    const ai = request();
    ai.readContext.styleDNA.neverSuggest = ["synergy"];
    await expect(
      harness(wire(output("We need synergy."))).provider.run(ai),
    ).rejects.toThrow("forbidden phrase");
  });
});

describe("cited culture research Responses contract", () => {
  it("requires web search, verifies cited URLs and forces unsaved records with server timestamps/IDs", async () => {
    const { provider, requests } = harness(
      research(),
      wire({ items: [radar("saved"), radar("saved")] }),
    );
    const started = Date.now();
    const items = await provider.researchCulture(
      "documented contrast patterns",
    );
    expect(requests).toHaveLength(2);
    expect(requests.every((body) => body.store === false)).toBe(true);
    expect(requests[0]).toMatchObject({
      model: "test-model",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
    });
    expect(requests[1].tools).toBeUndefined();
    expect(requests[1].text.format).toMatchObject({
      type: "json_schema",
      name: "culture_research",
      strict: true,
    });
    expect(JSON.stringify(requests[1].text.format)).not.toContain(
      '"format":"uri"',
    );
    expect(items.every((item) => item.status === "maybe")).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    for (const item of items) {
      expect(item.id).not.toBe("model-id");
      expect(Date.parse(item.lastVerifiedAt)).toBeGreaterThanOrEqual(started);
      expect(item.discoveredAt).toBe(item.lastVerifiedAt);
      expect(item.sources).toEqual([
        { title: citation.title, url: citation.url },
      ]);
    }
    expect(JSON.stringify(items)).not.toContain(testKey);
  });
  it.each([
    ["no citations", [message("Unsupported claim")]],
    ["no research text", [message("", [citation])]],
    [
      "non-web citation",
      [message("A claim", [{ ...citation, url: "file:///private" }])],
    ],
    [
      "malformed citation",
      [message("A claim", [{ ...citation, url: "not-a-url" }])],
    ],
  ])(
    "refuses research with %s before structured extraction",
    async (_label, value) => {
      const { provider, requests } = harness(value);
      await expect(provider.researchCulture("query")).rejects.toThrow();
      expect(requests).toHaveLength(1);
    },
  );
  it.each([
    ["no sources", { items: [{ ...radar(), sources: [] }] }],
    [
      "fabricated URL",
      {
        items: [
          {
            ...radar(),
            sources: [{ title: "Fake", url: "https://uncited.example/" }],
          },
        ],
      },
    ],
    ["invalid shape", { items: [{ term: "unverified" }] }],
  ])("rejects extracted records with %s", async (_label, value) => {
    await expect(
      harness(research(), wire(value)).provider.researchCulture("query"),
    ).rejects.toThrow();
  });
  it("allows empty results rather than fabricating evidence", async () => {
    expect(
      await harness(research(), wire({ items: [] })).provider.researchCulture(
        "query",
      ),
    ).toEqual([]);
  });
});
