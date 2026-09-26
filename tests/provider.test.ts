import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  aiRequestSchema,
  defaultSettings,
  documentTarget,
  newDocument,
  newSection,
  requestedVariantShape,
  targetFor,
  type AIRequest,
  type AIResponse,
  type LanguageRadarItem,
} from "../packages/domain/src/index";
import { OpenAIProvider } from "../apps/server/src/openai-provider";
import { MockProvider } from "../apps/server/src/mock-provider";
import {
  forbiddenPhrases,
  proposalViolation,
  validateProviderResponse,
} from "../apps/server/src/provider-policy";

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

describe("shared-piece generation contracts", () => {
  function piece() {
    const ai = request();
    const doc = ai.readContext.document;
    doc.sections = [
      newSection("Point", "The refrigerator light pooled on the empty floor."),
      newSection("Segue", "The light stayed on."),
      newSection("Point", "The repair bill meant we could not keep the house."),
    ];
    ai.editTarget = targetFor(doc, doc.sections[1].id);
    ai.action = "coach";
    ai.answer = "The light outlasted the conversation.";
    ai.instruction =
      "One short bridge. Carry the image, do not repeat the next section.";
    return ai;
  }
  it("reads explicit candidate counts without confusing revision questions with variants", () => {
    expect(requestedVariantShape("One short bridge.")).toEqual({
      min: 1,
      max: 1,
    });
    expect(requestedVariantShape("Two variants.")).toEqual({ min: 2, max: 2 });
    expect(requestedVariantShape("Two or three variants.")).toEqual({
      min: 2,
      max: 3,
    });
    expect(requestedVariantShape("Give me one revision question.")).toBeNull();
  });
  it("rejects a Segue that only restates the next section without losing a valid pivot", async () => {
    const ai = piece();
    const repeated = {
      ...output(),
      proposals: [
        {
          id: "repeat",
          label: "Repeat",
          text: "The repair bill meant we could not keep the house.",
          explanation: "",
        },
        {
          id: "pivot",
          label: "Pivot",
          text: "The light stayed on after the voices stopped.",
          explanation: "",
        },
      ],
    };
    const result = await harness(wire(repeated)).provider.run(ai);
    expect(result.proposals.map((p) => p.text)).toEqual([
      "The light stayed on after the voices stopped.",
    ]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("Repeats the next section"),
    );
  });
  it("applies the neighbor guard to a Segue shorten action, not just coach", async () => {
    const ai = piece();
    ai.action = "shorten";
    ai.readContext.document.sections[2].content = newSection(
      "Point",
      "The bill came due.",
    ).content;
    const result = await harness(
      wire(output("The bill came due.")),
    ).provider.run(ai);
    expect(result.proposals).toEqual([]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("Repeats the next section"),
    );
  });
  it("notes when a Segue drops a requested neighboring image without confusing context for edit permission", async () => {
    const ai = piece();
    const lost = await harness(
      wire(output("Only silence remained.")),
    ).provider.run(ai);
    expect(lost.proposals[0].qualityNote).toContain("refrigerator image");
    const carried = await harness(
      wire(output("The refrigerator hummed after the voices stopped.")),
    ).provider.run(ai);
    expect(carried.proposals[0].qualityNote).toContain(
      "Preserves the refrigerator image",
    );
    expect(ai.readContext.document.sections[0].content).toEqual(
      newSection("Point", "The refrigerator light pooled on the empty floor.")
        .content,
    );
  });
  it("keeps one valid short bridge when the model returned extra options", async () => {
    const ai = piece();
    ai.variantCount = 1;
    const result = await harness(
      wire({
        ...output(),
        proposals: [
          {
            id: "repeat",
            label: "Repeat",
            text: "The repair bill meant we could not keep the house.",
            explanation: "",
          },
          {
            id: "pivot",
            label: "Pivot",
            text: "The refrigerator hummed after the voices stopped.",
            explanation: "",
          },
        ],
      }),
    ).provider.run(ai);
    expect(result.proposals.map((p) => p.id)).toEqual(["pivot"]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("Repeats the next section"),
    );
  });
  it("keeps exactly two distinct ending options and flags a stock phrase mismatch", async () => {
    const ai = request("A hush. Then the refrigerator rattled again.");
    ai.instruction = "Two variants. Keep the refrigerator image.";
    const result = await harness(
      wire({
        ...output(),
        proposals: [
          {
            id: "a",
            label: "A",
            text: "A hush. The refrigerator rattled again.",
            explanation: "",
          },
          {
            id: "b",
            label: "B",
            text: "In conclusion, the refrigerator rattled again.",
            explanation: "",
          },
        ],
      }),
    ).provider.run(ai);
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].qualityNote).toContain("refrigerator");
    expect(result.proposals[1].qualityNote).toMatch(/stock|fragment/i);
    expect(result.qualityNotices).toBeUndefined();
  });
  it("does not protect a motif the writer explicitly asked to remove", async () => {
    const ai = request("Again. The refrigerator hummed again.");
    ai.instruction =
      "Remove the repetition and replace the refrigerator image. Two variants.";
    const result = await harness(
      wire({
        ...output(),
        proposals: [
          {
            id: "a",
            label: "A",
            text: "The kitchen fell quiet.",
            explanation: "",
          },
          {
            id: "b",
            label: "B",
            text: "Only the kitchen remained.",
            explanation: "",
          },
        ],
      }),
    ).provider.run(ai);
    expect(
      result.proposals.every(
        (p) => !/motif|refrigerator image/i.test(p.qualityNote ?? ""),
      ),
    ).toBe(true);
  });
  it("flags unmet variant count and detects cadence flattening without inventing a second ending", async () => {
    const ai = request("The refrigerator coughed. Again. Then silence. Again.");
    ai.instruction =
      "Two variants. Preserve the refrigerator and the repeated Again motif.";
    const result = await harness(
      wire(
        output(
          "The appliance ceased operating, leaving us with a sense of closure.",
        ),
      ),
    ).provider.run(ai);
    expect(result.proposals).toHaveLength(1);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("two variants"),
    );
    expect(result.proposals[0].qualityNote).toMatch(
      /fragment|motif|refrigerator/i,
    );
  });
  it("refuses unsupported authority and notes an unrequested generic takeaway", async () => {
    const ai = request("I kept the refrigerator door open.");
    await expect(
      harness(
        wire(output("Studies show we should leave it open.")),
      ).provider.run(ai),
    ).rejects.toThrow("unsupported authority");
    const result = await harness(
      wire(
        output("I kept the refrigerator door open. The takeaway is growth."),
      ),
    ).provider.run(ai);
    expect(result.proposals[0].qualityNote).toMatch(/takeaway|image/i);
  });
  it("flags a curly-apostrophe stock opener when it is absent from the draft", async () => {
    const ai = request("The room was quiet.");
    const result = await harness(
      wire(output("Here’s the thing: the room was quiet.")),
    ).provider.run(ai);
    expect(result.proposals[0].qualityNote).toContain("stock transition");
  });
  it("flags a multiline candidate instead of presenting it as a requested one-line bridge", async () => {
    const ai = request("The lights went out.");
    ai.instruction = "One line. One variant.";
    const result = await harness(
      wire(output("The lights went out.\nWe went home.")),
    ).provider.run(ai);
    expect(result.proposals).toEqual([]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("one line"),
    );
  });
  it("refuses replacement prose when a proposal-stage instruction says do not rewrite", async () => {
    const ai = request();
    ai.instruction = "Do not rewrite; tell me what to revise.";
    const result = await harness(wire(output("We use tools."))).provider.run(
      ai,
    );
    expect(result.proposals).toEqual([]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("not to rewrite"),
    );
  });
  it("answers a parked checklist placement question from canonical section placement", async () => {
    const ai = request();
    ai.action = "critique";
    ai.stage = "diagnose";
    ai.instruction = "Is this checklist part of the draft?";
    const checklist = newSection("Freeform", "Revise the opening.");
    checklist.label = "Revision checklist";
    checklist.placement = "parked";
    ai.readContext.document.sections.push(checklist);
    ai.editTarget = documentTarget(ai.readContext.document);
    const result = await harness(wire(output())).provider.run(ai);
    expect(result.diagnosis).toContain(
      "checklist is parked and outside the reader draft",
    );
    expect(result.proposals).toEqual([]);
    const secondPass = validateProviderResponse(ai, result, "openai");
    expect(secondPass.diagnosis).toBe(result.diagnosis);
    expect(secondPass.qualityNotices).toBeUndefined();
  });
  it("surfaces a missing revision question on analysis rather than pretending it answered", async () => {
    const ai = request();
    ai.action = "critique";
    ai.stage = "diagnose";
    ai.editTarget = documentTarget(ai.readContext.document);
    ai.instruction =
      "Where is repetition hurting this? Give me one revision question.";
    const result = await harness(
      wire({ ...output(), question: "", diagnosis: "The prose is clear." }),
    ).provider.run(ai);
    expect(result.proposals).toEqual([]);
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("one revision question"),
    );
  });
  it("keeps only one explicit revision question when critique returns two", async () => {
    const ai = request();
    ai.action = "critique";
    ai.stage = "diagnose";
    ai.editTarget = documentTarget(ai.readContext.document);
    ai.instruction = "Give me one revision question.";
    const result = await harness(
      wire({ ...output(), question: "What should stay? What should go?" }),
    ).provider.run(ai);
    expect(result.question).toBe("What should stay?");
    expect(result.qualityNotices).toContainEqual(
      expect.stringContaining("one revision question"),
    );
  });
  it("keeps diagnose with do-not-rewrite analysis-only", async () => {
    const ai = piece();
    ai.stage = "diagnose";
    ai.instruction = "Do not rewrite. Diagnose the gap.";
    expect((await harness(wire(output())).provider.run(ai)).proposals).toEqual(
      [],
    );
    await expect(
      harness(wire(output("Replacement"))).provider.run(ai),
    ).rejects.toThrow("diagnosis-only");
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
  it("explains the exact protected quote when it is short and omits long source spans", () => {
    const short = request("They said “keep this exact”.");
    expect(proposalViolation(short, "They said keep this exact.")).toContain(
      "“keep this exact”",
    );
    expect(proposalViolation(short, "They said keep this exact.")).toContain(
      "remove the quotation formatting",
    );
    const longQuote = `“${"private source detail ".repeat(10)}”`;
    const long = request(`They said ${longQuote}.`);
    const message = proposalViolation(long, "They said something else.")!;
    expect(message).toContain("protected quote in this section");
    expect(message).not.toContain("private source detail");
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
  it("rejects a known internal section ID in proposed prose without rewriting unrelated UUIDs", async () => {
    const ai = request();
    const known = ai.readContext.document.sections[0].id;
    await expect(
      harness(wire(output(`Replace ${known} with prose.`))).provider.run(ai),
    ).rejects.toThrow("internal section reference");
    const unknown = "00000000-0000-4000-8000-000000000000";
    expect(proposalViolation(ai, `Unrecognized ${unknown}.`)).toBeUndefined();
  });
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
