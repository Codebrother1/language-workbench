import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  aiRequestSchema,
  defaultSettings,
  emptyWorkbench,
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

describe("writer-selected context framing (injected Responses fixtures)", () => {
  const style = {
    source: "section_style" as const,
    itemId: "ending-rule",
    kind: "style_rule" as const,
    title: "Ending rule",
    text: "End on the object, not the lesson.",
  };
  const objective = {
    source: "writing_brief" as const,
    field: "objective" as const,
    value: "Make the reader want to call someone back without telling them to.",
  };
  const audience = {
    source: "writing_brief" as const,
    field: "audience" as const,
    value: "Readers already know the basics.",
  };
  const cases = [
    {
      name: "style only",
      style: [style],
      brief: [],
      question: "Is this ending explaining too much?",
      diagnosis:
        "The last sentence explains the object; the saved preference is a useful question, not an order to cut it.",
    },
    {
      name: "Brief only",
      style: [],
      brief: [objective],
      question: "Does this ending work?",
      diagnosis:
        "The stated objective may be served by leaving the emotional action with the reader.",
    },
    {
      name: "style and objective",
      style: [style],
      brief: [objective],
      question: "Is this ending explaining too much?",
      diagnosis:
        "The objective benefits from restraint, but ending literally on the object may weaken the callback.",
    },
    {
      name: "audience and style",
      style: [
        { ...style, text: "Prefer concrete nouns over abstract summaries." },
      ],
      brief: [audience],
      question: "Is this explanation doing useful work?",
      diagnosis:
        "For readers who know the basics the explanation may be redundant, while the saved concrete-noun preference is a separate choice.",
    },
    {
      name: "conflicting style and destination",
      style: [{ ...style, text: "Keep fragments when they carry rhythm." }],
      brief: [
        {
          source: "writing_brief" as const,
          field: "destination" as const,
          value: "Formal report.",
        },
      ],
      question: "Do the fragments help?",
      diagnosis:
        "Fragments preserve cadence, but a formal destination may make this sentence harder to scan; the writer decides.",
    },
    {
      name: "irrelevant destination",
      style: [],
      brief: [
        {
          source: "writing_brief" as const,
          field: "destination" as const,
          value: "Newsletter.",
        },
      ],
      question: "Does this comma interrupt the line?",
      diagnosis:
        "The comma creates a pause; the destination does not materially change this punctuation reading.",
    },
    {
      name: "multiple items of each kind",
      style: [
        style,
        {
          ...style,
          itemId: "cadence",
          text: "Keep the fragment if it earns the beat.",
        },
      ],
      brief: [objective, audience],
      question: "How much explanation stays?",
      diagnosis:
        "The audience knows the premise and the objective needs room to breathe; the two style preferences can be useful without dictating the ending.",
    },
  ];
  for (const sample of cases)
    it(`keeps ${sample.name} distinct and invites material reasoning rather than compliance`, async () => {
      const ai = request("The object stays. Then a lesson follows.");
      ai.action = "coach";
      ai.stage = "diagnose";
      ai.instruction = sample.question;
      ai.answer = "";
      ai.explicitGuidance = sample.style;
      ai.explicitBriefContext = sample.brief;
      const expected = { ...output(), diagnosis: sample.diagnosis };
      const { provider, requests, fetch } = harness(wire(expected));
      const result = await provider.run(ai);
      expect(result.diagnosis).toBe(sample.diagnosis);
      expect(fetch).toHaveBeenCalledOnce();
      const body = requests[0];
      const instructions = body.input
        .filter((part: any) => part.role === "developer")
        .map((part: any) => part.content)
        .join("\n");
      const writer = body.input.find((part: any) => part.role === "user");
      const data = JSON.parse(writer.content);
      expect(Object.keys(data).slice(0, 4)).toEqual([
        "WRITER_QUESTION",
        "EDIT_TARGET",
        "WRITER_SELECTED_GUIDANCE",
        "WRITER_SELECTED_BRIEF_CONTEXT",
      ]);
      expect(data.WRITER_QUESTION).toBe(sample.question);
      expect(data.EDIT_TARGET).toEqual(ai.editTarget);
      expect(data.WRITER_SELECTED_GUIDANCE).toEqual(sample.style);
      expect(data.WRITER_SELECTED_BRIEF_CONTEXT).toEqual(sample.brief);
      expect(data.READ_CONTEXT.document.id).toBe(ai.readContext.document.id);
      expect(instructions).toMatch(
        /consider each (writer-selected|attached) item/i,
      );
      expect(instructions).toMatch(/materially (affects|changes)/i);
      expect(instructions).toMatch(/tradeoff/i);
      expect(instructions).toMatch(/not (a hard rule|mandatory)/i);
      expect(instructions).toMatch(/irrelevant|does not materially/i);
      expect(instructions).toMatch(/avoid (a )?checklist|not a checklist/i);
      expect(instructions).toMatch(/never apply|never the author/i);
    });
});

describe("technical-writing analysis contract", () => {
  const cases = [
    {
      type: "quick_start",
      kind: "Prerequisite",
      passage: "First we explain the architecture. Then run the first command.",
      question: "Does this opening work?",
      context: /time to first success/i,
    },
    {
      type: "tutorial",
      kind: "Mental Model",
      passage: "Here is the finished system. Now we're going to take it apart.",
      question: "Is this backwards?",
      context: /learning progression/i,
    },
    {
      type: "technical_talk",
      kind: "Demo",
      passage: "Cold open, story, concept, demo, failure and callback.",
      question: "Does this talk work?",
      context: /pacing/i,
    },
    {
      type: "reference",
      kind: "Reference",
      passage: "Three paragraphs of story before the parameter conditions.",
      question: "Can readers find the conditions?",
      context: /lookup/i,
    },
    {
      type: "tutorial",
      kind: "Example",
      passage: "This pagination example also uses auth, retries and logging.",
      question: "Is this example doing too much?",
      context: /learning progression/i,
    },
    {
      type: "how_to",
      kind: "Step",
      passage:
        "The client needs a token. Without it, the server has no idea who the hell you are.",
      question: "Is my voice working?",
      context: /goal/i,
    },
    {
      type: "explanation",
      kind: "Concept",
      passage: "We call it a thingy. Later we introduce the formal term.",
      question: "Is this terminology shift deliberate?",
      context: /mental model/i,
    },
    {
      type: "api_reference",
      kind: "API Surface",
      passage: "This endpoint returns immediately.",
      question: "Is this technically accurate?",
      context: /precision/i,
    },
  ] as const;
  for (const sample of [
    {
      name: "direct support",
      draft: "The endpoint returns 200 after completion.",
      source: "The endpoint returns 200 after completion.",
    },
    {
      name: "contradiction",
      draft: "The endpoint always returns 200.",
      source: "The endpoint may return 202 when pending.",
    },
    {
      name: "stronger claim",
      draft: "The endpoint always returns 200.",
      source: "The endpoint can return 200 when already complete.",
    },
    {
      name: "unsupported behavior",
      draft: "The endpoint returns immediately after the job finishes.",
      source: "The endpoint accepts a job and returns an identifier.",
    },
    {
      name: "terminology difference",
      draft: "The endpoint requires a token.",
      source: "The endpoint requires a credential in the authorization header.",
    },
    {
      name: "status-code discrepancy",
      draft: "The endpoint always returns 200 for creation.",
      source: "The endpoint returns 202 while creation is pending.",
    },
    {
      name: "no source",
      draft: "The endpoint returns immediately.",
      source: "",
    },
  ])
    it(`exposes only supplied excerpts for ${sample.name} without asserting the relation deterministically`, async () => {
      const ai = request(sample.draft);
      ai.action = "technical_writing";
      ai.stage = "diagnose";
      ai.instruction = "Does my source establish this wording?";
      ai.readContext.document.brief.contentType = "api_reference";
      if (sample.source)
        ai.readContext.document.sources = [
          {
            id: "note",
            title: "Endpoint API note",
            kind: "notes",
            text: sample.source,
            url: "",
          },
        ];
      const { provider, requests } = harness(wire(output()));
      await provider.run(ai);
      const data = JSON.parse(
        requests[0].input.find((part: any) => part.role === "user").content,
      );
      expect(data.READ_CONTEXT.document.sources).toEqual([]);
      expect(
        data.TECHNICAL_SOURCE_CONTEXT.items.map((item: any) => item.excerpt),
      ).toEqual(sample.source ? [sample.source] : []);
      expect(data.WRITER_QUESTION).toBe(ai.instruction);
    });
  it("bounds relevant supplied source evidence and keeps absent evidence distinct from factual verification", async () => {
    const ai = request("This endpoint always returns 200.");
    ai.action = "technical_writing";
    ai.stage = "diagnose";
    ai.instruction = "Does the source support always returns 200?";
    ai.readContext.document.brief.contentType = "api_reference";
    ai.readContext.document.sources.push(
      {
        id: "api",
        title: "Endpoint response notes",
        kind: "notes",
        text: "The endpoint may return 202 when creation happens asynchronously. The response may return 200 when already complete.",
        url: "",
      },
      {
        id: "distant",
        title: "Meeting notes",
        kind: "notes",
        text: "Unrelated discussion about hiring.",
        url: "",
      },
    );
    const { provider, requests } = harness(wire(output()));
    await provider.run(ai);
    const body = requests[0];
    const instructions = body.input
      .filter((part: any) => part.role === "developer")
      .map((part: any) => part.content)
      .join("\n");
    const data = JSON.parse(
      body.input.find((part: any) => part.role === "user").content,
    );
    expect(data.READ_CONTEXT.document.sources).toEqual([]);
    expect(data.TECHNICAL_SOURCE_CONTEXT.items).toHaveLength(1);
    expect(data.TECHNICAL_SOURCE_CONTEXT.items[0]).toMatchObject({
      title: "Endpoint response notes",
      kind: "notes",
    });
    expect(data.TECHNICAL_SOURCE_CONTEXT.items[0].excerpt).toContain("202");
    expect(data.TECHNICAL_SOURCE_CONTEXT.items[0].truncated).toBe(false);
    expect(data.TECHNICAL_SOURCE_CONTEXT.availability).toBe(
      "excerpts_supplied",
    );
    expect(data.TECHNICAL_SOURCE_CONTEXT.selection).toMatch(
      /complete.*source|entire.*source/i,
    );
    expect(instructions).toMatch(/source.*provenance|source.*supplied/i);
    expect(instructions).toMatch(/fail to establish|stronger assertion/i);
    expect(instructions).toMatch(/no.*source.*factual verification/i);
    expect(instructions).toMatch(/untrusted/i);
    ai.readContext.document.sources = [];
    const absent = harness(wire(output()));
    await absent.provider.run(ai);
    const without = JSON.parse(
      absent.requests[0].input.find((part: any) => part.role === "user")
        .content,
    );
    expect(without.TECHNICAL_SOURCE_CONTEXT.items).toEqual([]);
    expect(without.TECHNICAL_SOURCE_CONTEXT.availability).toBe("no_sources");
    ai.readContext.document.sources = [
      {
        id: "unrelated",
        title: "Meeting calendar",
        kind: "notes",
        text: "Team lunch is on Friday.",
        url: "",
      },
    ];
    ai.technicalSources = [];
    ai.technicalSourceCount = 1;
    const unselected = harness(wire(output()));
    await unselected.provider.run(ai);
    const present = JSON.parse(
      unselected.requests[0].input.find((part: any) => part.role === "user")
        .content,
    );
    expect(present.TECHNICAL_SOURCE_CONTEXT.items).toEqual([]);
    expect(present.TECHNICAL_SOURCE_CONTEXT.availability).toBe(
      "no_relevant_excerpt_selected",
    );
    expect(present.TECHNICAL_SOURCE_CONTEXT.selection).toMatch(
      /no relevant source excerpt/i,
    );
  });
  it("does not present an unchosen structural default as writer-stated on a quick-start question", async () => {
    const question =
      "Does this opening work for a quick start, or am I making the reader wait too long before doing anything?";
    const ai = request("First explain the system. Then run the request.");
    ai.action = "technical_writing";
    ai.stage = "diagnose";
    ai.instruction = question;
    ai.readContext.document.brief.contentType = "quick_start";
    ai.controls = { mechanism: "Begin with consequence" };
    ai.readContext.document.sections[0].workbench = {
      ...emptyWorkbench(),
      controls: { mechanism: "Begin with consequence" },
    };
    ai.explicitGuidance = [
      {
        source: "style_dna",
        key: "register",
        title: "Voice",
        text: "Keep a conversational voice.",
      },
    ];
    ai.explicitBriefContext = [
      {
        source: "writing_brief",
        field: "audience",
        value: "Developers who know HTTP",
      },
    ];
    const { provider, requests } = harness(wire(output()));
    await provider.run(ai);
    const data = JSON.parse(
      requests[0].input.find((part: any) => part.role === "user").content,
    );
    expect(data.WRITER_QUESTION).toBe(question);
    expect(data.controls.mechanism).toBeUndefined();
    expect(
      data.READ_CONTEXT.document.sections[0].workbench.controls.mechanism,
    ).toBeUndefined();
    expect(data.TECHNICAL_WRITING_CONTEXT.considerations).toMatch(
      /time to first success/i,
    );
    expect(data.WRITER_SELECTED_GUIDANCE).toEqual(ai.explicitGuidance);
    expect(data.WRITER_SELECTED_BRIEF_CONTEXT).toEqual(ai.explicitBriefContext);
    ai.readContext.document.sections[0].workbench.selectedControlKeys = [
      "mechanism",
    ];
    const chosen = harness(wire(output()));
    await chosen.provider.run(ai);
    const selected = JSON.parse(
      chosen.requests[0].input.find((part: any) => part.role === "user")
        .content,
    );
    expect(selected.controls.mechanism).toBe("Begin with consequence");
    expect(
      selected.READ_CONTEXT.document.sections[0].workbench.controls.mechanism,
    ).toBe("Begin with consequence");
    ai.readContext.document.sections[0].workbench.selectedControlKeys =
      undefined;
    ai.readContext.document.sections[0].workbench.controls.mechanism =
      "Open on a strange detail";
    ai.controls.mechanism = "Open on a strange detail";
    const persisted = harness(wire(output()));
    await persisted.provider.run(ai);
    const retained = JSON.parse(
      persisted.requests[0].input.find((part: any) => part.role === "user")
        .content,
    );
    expect(retained.controls.mechanism).toBe("Open on a strange detail");
    ai.editTarget = documentTarget(ai.readContext.document);
    ai.readContext.document.workbench = {
      ...emptyWorkbench(),
      controls: { mechanism: "Begin with consequence" },
    };
    ai.controls.mechanism = "Begin with consequence";
    const whole = harness(wire(output()));
    await whole.provider.run(ai);
    const entire = JSON.parse(
      whole.requests[0].input.find((part: any) => part.role === "user").content,
    );
    expect(entire.controls.mechanism).toBeUndefined();
    expect(
      entire.READ_CONTEXT.document.workbench.controls.mechanism,
    ).toBeUndefined();
  });
  it("uses a saved technical context for follow-ups rather than retroactively adopting the edited Brief", async () => {
    const ai = request("Explain the model before the commands.");
    ai.action = "technical_writing";
    ai.stage = "diagnose";
    ai.instruction = "Why explain this first?";
    ai.technicalContext = {
      contentType: "quick_start",
      sectionKind: "Mental Model",
      audience: "Developers who know HTTP",
      objectives: ["Prevent a wrong mental model"],
      destination: "Docs",
      customNotes: "",
    };
    ai.readContext.document.brief.contentType = "reference";
    ai.readContext.document.sources.push({
      id: "updated",
      title: "New API note",
      kind: "notes",
      text: "The newer API note says 204; this was added after the saved run.",
      url: "",
    });
    ai.technicalSources = [
      {
        title: "Original API note",
        kind: "notes",
        excerpt: "The response may return 202 while creation is pending.",
        truncated: false,
      },
    ];
    ai.readContext.document.sections[0].kind = "Reference";
    ai.readContext.document.sections[0].workbench = emptyWorkbench();
    ai.readContext.document.sections[0].workbench!.runs.push({
      id: "saved-run",
      createdAt: ai.readContext.document.createdAt,
      target: ai.editTarget,
      action: ai.action,
      stage: "diagnose",
      instruction: ai.instruction,
      answer: "",
      controls: {},
      model: null,
      conversation: [],
      guidance: [],
      briefContext: [],
      technicalContext: ai.technicalContext,
      technicalSources: ai.technicalSources,
      response: output(),
    });
    ai.followUp = {
      runId: "saved-run",
      question: "Would showing the command first help?",
      originalInstruction: ai.instruction,
      originalResult: {
        diagnosis: "Earlier reading",
        mechanism: "First explain the tradeoff",
        question: "What should be protected?",
      },
      turns: [],
      targetStatus: "exact",
    };
    const { provider, requests } = harness(wire(output()));
    await provider.run(ai);
    const data = JSON.parse(
      requests[0].input.find((part: any) => part.role === "user").content,
    );
    expect(data.WRITER_QUESTION).toBe(ai.followUp.question);
    expect(data.TECHNICAL_WRITING_CONTEXT).toMatchObject(ai.technicalContext);
    expect(data.TECHNICAL_WRITING_CONTEXT.considerations).toMatch(
      /time to first success/i,
    );
    expect(data.READ_CONTEXT.document.brief.contentType).toBe("reference");
    expect(data.READ_CONTEXT.document.sections[0].kind).toBe("Reference");
    expect(data.READ_CONTEXT.document.sources).toEqual([]);
    expect(data.TECHNICAL_SOURCE_CONTEXT.items).toEqual(ai.technicalSources);
    expect(JSON.stringify(data)).not.toContain("The newer API note says 204");
  });
  it("rejects proposals in analysis, never silently falls back offline, and keeps nontechnical runs unchanged", async () => {
    const ai = request(
      "The example is realistic and may distract from pagination.",
    );
    ai.action = "technical_writing";
    ai.stage = "diagnose";
    ai.instruction = "Is the example doing too much?";
    ai.answer = "";
    const offline = await new MockProvider().run(ai);
    expect(offline.proposals).toEqual([]);
    expect(offline.diagnosis).toMatch(/offline cannot evaluate/i);
    expect(offline.diagnosis).not.toMatch(/too complex|must simplify/i);
    await expect(
      new MockProvider().run({ ...ai, stage: "propose" }),
    ).rejects.toThrow(/analysis-only/i);
    expect(() =>
      validateProviderResponse(
        ai,
        {
          ...output(),
          proposals: [
            {
              id: "unsolicited",
              label: "Rewrite",
              text: "Replace everything",
              explanation: "",
            },
          ],
        },
        "openai",
      ),
    ).toThrow(/diagnosis-only/i);
    const { provider, requests } = harness(wire(output()));
    await provider.run({ ...ai, action: "coach" });
    const body = JSON.parse(
      requests[0].input.find((part: any) => part.role === "user").content,
    );
    expect(body.TECHNICAL_WRITING_CONTEXT).toBeUndefined();
  });
  for (const sample of [
    {
      type: "quick_start",
      target:
        "We explain the mental model before the first command because running it blindly is unsafe.",
      question: "Is this necessary before first success?",
      expected: [/hidden setup cost/i, /expected result/i, /unsafe/i],
    },
    {
      type: "tutorial",
      target: "Here is the finished system. Now let's take it apart.",
      question: "Does this teach beyond the example?",
      expected: [
        /transfer/i,
        /(?:whole|finished).system.first/i,
        /checkpoint/i,
      ],
    },
    {
      type: "how_to",
      target: "To rotate a key, first read the full architecture overview.",
      question: "Am I helping them accomplish the thing?",
      expected: [/stopping point/i, /detour/i, /goal/i],
    },
    {
      type: "explanation",
      target: "The queue is a line, except messages can be processed twice.",
      question: "Does the analogy hold?",
      expected: [/boundary/i, /analogy/i, /misconception/i],
    },
    {
      type: "reference",
      target: "A long story appears before the parameter conditions.",
      question: "Can this be looked up?",
      expected: [/lookup/i, /defaults/i, /narrative/i],
    },
    {
      type: "api_reference",
      target: "The endpoint always returns 200.",
      question: "Does the source establish this?",
      expected: [/response/i, /errors/i, /normative/i],
    },
    {
      type: "troubleshooting",
      target: "When you see this symptom, replace the database.",
      question: "What evidence is missing?",
      expected: [/competing causes/i, /diagnostic test/i, /verification/i],
    },
    {
      type: "readme",
      target: "Architecture background appears before install instructions.",
      question: "Does this orient a first-time reader?",
      expected: [/startup signal/i, /prerequisite/i, /orientation/i],
    },
    {
      type: "technical_talk",
      target: "Story, demo, failure, then callback.",
      question: "Can a listener recover if they miss one point?",
      expected: [/spoken memory/i, /demo payoff/i, /recover/i],
    },
    {
      type: "architecture",
      target:
        "We chose this design, without mentioning the rejected alternatives.",
      question: "What reasoning is missing?",
      expected: [/system boundaries/i, /alternatives/i, /operational/i],
    },
    {
      type: "engineering_decision",
      target: "This is the best approach, but we never state the criterion.",
      question: "What supports this recommendation?",
      expected: [/criteria/i, /reversibility/i, /uncertainty/i],
    },
  ] as const)
    it(`uses only the ${sample.type} reader-problem lens for the writer's question`, async () => {
      const ai = request(sample.target);
      ai.action = "technical_writing";
      ai.stage = "diagnose";
      ai.instruction = sample.question;
      ai.readContext.document.brief.contentType = sample.type;
      const { provider, requests } = harness(wire(output()));
      await provider.run(ai);
      const data = JSON.parse(
        requests[0].input.find((part: any) => part.role === "user").content,
      );
      expect(data.WRITER_QUESTION).toBe(sample.question);
      for (const phrase of sample.expected)
        expect(data.TECHNICAL_WRITING_CONTEXT.considerations).toMatch(phrase);
      expect(data.TECHNICAL_WRITING_CONTEXT).not.toHaveProperty("checklist");
    });
  for (const sample of cases)
    it(`keeps ${sample.type} / ${sample.kind} advisory and writer-led`, async () => {
      const ai = request(sample.passage);
      ai.action = "technical_writing";
      ai.stage = "diagnose";
      ai.instruction = sample.question;
      ai.readContext.document.brief.contentType = sample.type;
      ai.readContext.document.brief.audience = "Engineers who know HTTP";
      ai.readContext.document.sections[0].kind = sample.kind;
      ai.readContext.document.sections[0].label = sample.kind;
      ai.explicitGuidance = [
        {
          source: "style_dna",
          key: "register",
          title: "Keep the voice",
          text: "Prefer conversational clarity.",
        },
      ];
      ai.explicitBriefContext = [
        {
          source: "writing_brief",
          field: "audience",
          value: "Engineers who know HTTP",
        },
      ];
      const { provider, requests } = harness(wire(output()));
      await provider.run(ai);
      const body = requests[0];
      const instructions = body.input
        .filter((part: any) => part.role === "developer")
        .map((part: any) => part.content)
        .join("\n");
      const data = JSON.parse(
        body.input.find((part: any) => part.role === "user").content,
      );
      expect(data.WRITER_QUESTION).toBe(sample.question);
      expect(data.EDIT_TARGET).toEqual(ai.editTarget);
      expect(data.READ_CONTEXT.document.brief.contentType).toBe(sample.type);
      expect(data.READ_CONTEXT.document.sections[0].kind).toBe(sample.kind);
      expect(data.WRITER_SELECTED_GUIDANCE).toEqual(ai.explicitGuidance);
      expect(data.WRITER_SELECTED_BRIEF_CONTEXT).toEqual(
        ai.explicitBriefContext,
      );
      expect(data.TECHNICAL_WRITING_CONTEXT.considerations).toMatch(
        sample.context,
      );
      expect(instructions).toMatch(/deliberate inversion/i);
      expect(instructions).toMatch(/tradeoff/i);
      expect(instructions).toMatch(/not.*mandatory|not.*checklist/i);
      expect(instructions).toMatch(/profani|writer.s voice/i);
      expect(instructions).toMatch(
        /do not (invent|assert).*api|factual verification/i,
      );
      expect(instructions).toMatch(/code.*pedagogical/i);
      expect(instructions).toMatch(/no replacement proposals/i);
    });
});

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
    ai.readContext.document.revisionPlan = [
      {
        id: "private-note",
        sectionId: ai.readContext.document.sections[0].id,
        text: "Private revision intention not for the model.",
        createdAt: ai.readContext.document.createdAt,
        completedAt: null,
      },
    ];
    ai.readContext.document.revisionCheckpoint = {
      id: "checkpoint",
      createdAt: ai.readContext.document.createdAt,
      draftRevision: 0,
      label: "Before revision",
      sections: ai.readContext.document.sections.map((section, order) => ({
        id: section.id,
        order,
        kind: section.kind,
        label: section.label,
        placement: section.placement,
        text: "Earlier human wording.",
        content: structuredClone(section.content),
      })),
    };
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
    expect(data.READ_CONTEXT.document.revisionCheckpoint).toBeUndefined();
    expect(data.READ_CONTEXT.document.revisionPlan).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(
      "Private revision intention not for the model.",
    );
    expect(JSON.stringify(body)).not.toContain("Earlier human wording.");
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
