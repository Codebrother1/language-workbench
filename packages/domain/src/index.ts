import {
  libraryKinds,
  personalLibrarySchema,
  resolvedWritingStyleSchema,
} from "./personal-library";
import { structureDraftSchema, structureRequestSchema } from "./composition";
export * from "./personal-library";
export * from "./composition";
import { z } from "zod";
import {
  modelRefSchema,
  routingPreferencesSchema,
  lensOptionsSchema,
} from "./routing";
import { aiResponseSchema, type AIResponse } from "./ai-output";
export * from "./routing";
export * from "./ai-output";

export const sourceKinds = [
  "text",
  "comment",
  "quote",
  "transcript",
  "article",
  "repo",
  "notes",
  "other",
] as const;
export const technicalContentTypes = [
  "tutorial",
  "how_to",
  "quick_start",
  "explanation",
  "reference",
  "api_reference",
  "troubleshooting",
  "readme",
  "architecture",
  "engineering_decision",
  "technical_talk",
] as const;
export const technicalSectionRoles = [
  "Goal",
  "Prerequisite",
  "Step",
  "Expected Result",
  "Verification",
  "Concept",
  "Mental Model",
  "Counterexample",
  "Demo",
  "Warning",
  "Constraint",
  "Failure Mode",
  "Troubleshooting",
  "Recovery",
  "Reference",
  "API Surface",
  "Decision",
  "Alternative",
  "Tradeoff",
  "Assumption",
  "Why",
  "Recap",
  "Next Step",
] as const;
export const contentTypes = [
  "narration",
  "article",
  "post",
  "reply",
  "quote_repost",
  "clip_commentary",
  "thread",
  "announcement",
  "marketing",
  "story",
  ...technicalContentTypes,
  "freeform",
] as const;
export const sectionKinds = [
  "Title",
  "Headline",
  "Subtitle",
  "Hook",
  "Cold Open",
  "Setup",
  "Story",
  "Beat",
  "Point",
  "Example",
  "Evidence",
  "Context",
  "Segue",
  "Transition",
  "Tension",
  "Escalation",
  "Reveal",
  "Callback",
  "Reaction",
  "Explanation",
  "Punchline",
  "Conclusion",
  "Closer",
  "Sign-off",
  "Cliffhanger",
  "To Be Continued",
  ...technicalSectionRoles,
  "Freeform",
] as const;
export const writingBriefSchema = z.object({
  contentType: z.enum(contentTypes).default("freeform"),
  destination: z.string().default(""),
  objectives: z.array(z.string()).default([]),
  audience: z.string().default(""),
  desiredReactions: z.array(z.string()).default([]),
  sourceMaterialType: z
    .enum([
      "none",
      "text",
      "comment",
      "article",
      "clip",
      "transcript",
      "repo",
      "announcement",
      "other",
    ])
    .default("none"),
  frameworkPreference: z
    .enum(["none", "reference_only", "intentional"])
    .default("none"),
  excludedFrameworks: z.array(z.string()).default([]),
  desiredLength: z.string().default(""),
  customNotes: z.string().default(""),
});
export type WritingBrief = z.infer<typeof writingBriefSchema>;
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
};
export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    text: z.string().optional(),
    attrs: z.record(z.unknown()).optional(),
    marks: z
      .array(
        z.object({ type: z.string(), attrs: z.record(z.unknown()).optional() }),
      )
      .optional(),
    content: z.array(richNodeSchema).optional(),
  }),
);
export const editTargetSchema = z.object({
  scope: z.enum(["document", "section", "selection", "word"]),
  unit: z.enum(["selection", "sentence", "quoted_turn"]).optional(),
  focusOrigin: z.literal("explicit").optional(),
  sectionId: z.string().nullable(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  text: z.string(),
  sectionSnapshot: z.string(),
  documentId: z.string(),
  documentRevision: z.number().int().min(0),
});
export type EditTarget = z.infer<typeof editTargetSchema>;
export type SelectionTarget = EditTarget;
export const savedGuidanceSchema = z.object({
  source: z.enum(["style_dna", "section_style", "library", "connector"]),
  itemId: z.string().optional(),
  kind: z.enum(libraryKinds).optional(),
  preference: z.enum(["like", "avoid", "reference"]).optional(),
  key: z.string().optional(),
  title: z.string().max(240),
  text: z.string().trim().min(1).max(3000),
});
export type SavedGuidance = z.infer<typeof savedGuidanceSchema>;
export const savedBriefContextSchema = z.object({
  source: z.literal("writing_brief"),
  field: z.enum([
    "audience",
    "objective",
    "destination",
    "content_type",
    "source_material_type",
    "framework_preference",
    "excluded_frameworks",
    "custom_notes",
    "desired_length",
    "desired_reaction",
  ]),
  value: z.string().trim().min(1).max(3000),
});
export type SavedBriefContext = z.infer<typeof savedBriefContextSchema>;
export const technicalContextSchema = z.object({
  contentType: z.enum(contentTypes),
  sectionKind: z.enum(sectionKinds).nullable(),
  audience: z.string(),
  objectives: z.array(z.string()),
  destination: z.string(),
  customNotes: z.string(),
});
export type TechnicalContext = z.infer<typeof technicalContextSchema>;
export const technicalSourceSchema = z.object({
  title: z.string().max(240),
  kind: z.enum(sourceKinds),
  excerpt: z.string().max(1500),
  truncated: z.boolean(),
});
export type TechnicalSource = z.infer<typeof technicalSourceSchema>;
export const labConversationTurnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["writer", "assistant"]),
  text: z.string().trim().min(1).max(10000),
  createdAt: z.string().min(1),
  model: modelRefSchema.optional(),
  provider: z.string().optional(),
  proposals: aiResponseSchema.shape.proposals.optional(),
});
export type LabConversationTurn = z.infer<typeof labConversationTurnSchema>;
export const workbenchRunSchema = z.object({
  structure: structureRequestSchema.optional(),
  lens: lensOptionsSchema.optional(),
  id: z.string(),
  createdAt: z.string(),
  target: editTargetSchema,
  stage: z.enum(["diagnose", "propose"]).optional(),
  action: z.string(),
  instruction: z.string(),
  answer: z.string(),
  controls: z.record(z.union([z.string(), z.number(), z.boolean()])),
  selectedControlKeys: z.array(z.string()).optional(),
  model: modelRefSchema.nullable(),
  chainModel: modelRefSchema.optional(),
  conversation: z.array(labConversationTurnSchema).max(24).default([]),
  guidance: z.array(savedGuidanceSchema).max(3).default([]),
  briefContext: z.array(savedBriefContextSchema).max(3).default([]),
  technicalContext: technicalContextSchema.optional(),
  technicalSources: z.array(technicalSourceSchema).max(3).optional(),
  technicalSourceCount: z.number().int().min(0).optional(),
  response: aiResponseSchema.extend({
    model: modelRefSchema.optional(),
    routeSource: z.string().optional(),
  }),
});
export type WorkbenchRun = z.infer<typeof workbenchRunSchema>;
export const sectionWorkbenchSchema = z.object({
  questionAnswers: z.record(z.string()).default({}),
  targetDrafts: z
    .record(
      z.object({
        target: editTargetSchema,
        instruction: z.string(),
        answer: z.string(),
      }),
    )
    .optional(),
  structure: structureDraftSchema.optional(),
  instruction: z.string().default(""),
  answer: z.string().default(""),
  action: z.string().default("coach"),
  controls: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  selectedControlKeys: z.array(z.string()).optional(),
  lens: lensOptionsSchema.default({}),
  oneOffModel: modelRefSchema.nullable().default(null),
  runChain: z
    .object({ model: modelRefSchema, target: editTargetSchema })
    .nullable()
    .optional(),
  clearedChainRunId: z.string().nullable().optional(),
  compareModels: z.array(modelRefSchema).max(4).default([]),
  runs: z.array(workbenchRunSchema).default([]),
  activeRunId: z.string().nullable().default(null),
  proposalStates: z.record(z.string()).default({}),
});
export type SectionWorkbench = z.infer<typeof sectionWorkbenchSchema>;
export function emptyWorkbench(): SectionWorkbench {
  return sectionWorkbenchSchema.parse({});
}
export const variantSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
  target: editTargetSchema,
  sourceTarget: editTargetSchema.optional(),
  createdAt: z.string(),
  origin: z.enum(["human", "ai", "original"]),
  model: modelRefSchema.optional(),
  runId: z.string().optional(),
});
export type Variant = z.infer<typeof variantSchema>;
export const iterationSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  target: editTargetSchema,
  instruction: z.string(),
  coachQuestion: z.string(),
  userAnswer: z.string(),
  proposal: z.string(),
  state: z.enum(["proposed", "accepted", "rejected", "saved"]),
  provider: z.string(),
  model: modelRefSchema.optional(),
  runId: z.string().optional(),
});
export type Iteration = z.infer<typeof iterationSchema>;
export const revisionTrailEntrySchema = z.object({
  id: z.string(),
  runId: z.string(),
  sectionId: z.string(),
  findingIndex: z.number().int().min(0).nullable(),
  viewedAt: z.string(),
  editedAt: z.string(),
  savedRevision: z.number().int().min(0).nullable(),
});
export type RevisionTrailEntry = z.infer<typeof revisionTrailEntrySchema>;
export const writingSectionSchema = z.object({
  id: z.string(),
  kind: z.enum(sectionKinds),
  label: z.string(),
  placement: z.enum(["draft", "parked"]).default("draft"),
  parkedGroupId: z.string().nullable().default(null),
  lastParkedGroupId: z.string().nullable().default(null),
  content: z.array(richNodeSchema),
  notes: z.string().default(""),
  variants: z.array(variantSchema).default([]),
  modelOverride: modelRefSchema.nullable().optional(),
  workbench: sectionWorkbenchSchema.optional(),
});
export type WritingSection = z.infer<typeof writingSectionSchema>;
export const parkedGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  collapsed: z.boolean().default(false),
});
export type ParkedGroup = z.infer<typeof parkedGroupSchema>;
export const sourceMaterialSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(sourceKinds),
  text: z.string(),
  url: z.string().default(""),
});
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;
export const memoryDecisionSchema = z.object({
  id: z.string().min(1),
  text: z.string().max(1200),
  createdAt: z.string().min(1),
});
export type MemoryDecision = z.infer<typeof memoryDecisionSchema>;
export const pieceMemorySchema = z.object({
  purpose: z.string().max(3000).default(""),
  reader: z.string().max(1200).default(""),
  currentQuestion: z.string().max(1800).default(""),
  unresolved: z.array(z.string().max(1200)).max(200).default([]),
  decisions: z.array(memoryDecisionSchema).max(200).default([]),
  nextMove: z.string().max(1200).default(""),
  nextMoveSectionId: z.string().min(1).nullable().default(null),
  lastSessionNote: z.string().max(3000).default(""),
  updatedAt: z.string().optional(),
  reviewedDraftRevision: z.number().int().min(0).default(0),
});
export type PieceMemory = z.infer<typeof pieceMemorySchema>;
export const guidanceDismissalSchema = z.object({
  identity: z.string().min(1),
  sectionId: z.string().min(1),
  context: z.string().min(1),
});
export type GuidanceDismissal = z.infer<typeof guidanceDismissalSchema>;
export const revisionSectionSnapshotSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  kind: z.enum(sectionKinds),
  label: z.string(),
  placement: z.enum(["draft", "parked"]),
  text: z.string(),
  content: z.array(richNodeSchema),
});
export const revisionCheckpointSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.string().min(1),
    draftRevision: z.number().int().min(0),
    label: z.string().max(120).default(""),
    sections: z.array(revisionSectionSnapshotSchema).max(5000),
  })
  .refine(
    (checkpoint) =>
      new Set(checkpoint.sections.map((section) => section.id)).size ===
      checkpoint.sections.length,
  );
export type RevisionCheckpoint = z.infer<typeof revisionCheckpointSchema>;
export const revisionIntentSchema = z.object({
  id: z.string().min(1),
  sectionId: z.string().min(1),
  text: z.string().trim().min(1).max(1200),
  createdAt: z.string().min(1),
  completedAt: z.string().nullable().default(null),
});
export type RevisionIntent = z.infer<typeof revisionIntentSchema>;
export const revisionPlanSchema = z.preprocess((value) => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((entry) => {
    const parsed = revisionIntentSchema.safeParse(entry);
    if (!parsed.success || ids.has(parsed.data.id)) return [];
    ids.add(parsed.data.id);
    return [parsed.data];
  });
}, z.array(revisionIntentSchema));
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    title: z.string().min(1).max(240),
    createdAt: z.string(),
    updatedAt: z.string(),
    revision: z.number().int().min(0),
    brief: writingBriefSchema,
    draftRevision: z.number().int().min(0).default(0),
    revisionCheckpoint: revisionCheckpointSchema
      .or(z.unknown().transform(() => undefined))
      .optional(),
    revisionPlan: revisionPlanSchema.default([]),
    pieceMemory: pieceMemorySchema.default({}),
    guidanceDismissals: z.array(guidanceDismissalSchema).max(500).default([]),
    sections: z.array(writingSectionSchema).min(1),
    parkedGroups: z.array(parkedGroupSchema).default([]),
    sources: z.array(sourceMaterialSchema).default([]),
    history: z.array(iterationSchema).default([]),
    revisionTrail: z.array(revisionTrailEntrySchema).max(100).default([]),
    focusTarget: editTargetSchema.nullable().optional(),
    selectedSectionId: z.string().nullable().optional(),
    defaultModel: modelRefSchema.nullable().optional(),
    workbench: sectionWorkbenchSchema.optional(),
  })
  .refine(
    (doc) =>
      doc.sections.every((s) => s.id.trim().length > 0) &&
      new Set(doc.sections.map((s) => s.id)).size === doc.sections.length &&
      new Set(doc.parkedGroups.map((g) => g.id)).size ===
        doc.parkedGroups.length &&
      new Set(doc.pieceMemory.decisions.map((decision) => decision.id)).size ===
        doc.pieceMemory.decisions.length &&
      doc.sections.every(
        (s) =>
          s.placement !== "parked" ||
          !s.parkedGroupId ||
          doc.parkedGroups.some((g) => g.id === s.parkedGroupId),
      ),
    { message: "Section and parked-group references must be valid." },
  );
export type Document = z.infer<typeof documentSchema>;
export function selectTechnicalSources(
  doc: Document,
  target: EditTarget,
  question: string,
): TechnicalSource[] {
  const ignored = new Set(
    "the and for with from that this are was you your does what when where which should would could have about source sources notes note material reference draft writing after before works using use".split(
      " ",
    ),
  );
  const weak = new Set(
    "api client network system data request response install token minute key endpoint".split(
      " ",
    ),
  );
  const tokens = (value: string) =>
    [
      ...value
        .toLowerCase()
        .matchAll(
          /--[\p{L}][\p{L}\p{N}_-]*|\/[\p{L}][\p{L}\p{N}_/-]*|[\p{L}\p{N}][\p{L}\p{N}_-]*/gu,
        ),
    ].flatMap((match) => {
      const raw = match[0];
      const term =
        raw.length > 4 && raw.endsWith("ies")
          ? `${raw.slice(0, -3)}y`
          : raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss")
            ? raw.slice(0, -1)
            : raw;
      if (ignored.has(term) || (term.length < 3 && !/^\d+$/.test(term)))
        return [];
      const weight =
        /^\d{3}$/.test(term) ||
        (/^--|^\//.test(term) && !weak.has(term.slice(1))) ||
        (/[_-]/.test(term) && term.length > 5)
          ? 7
          : /^\d+$/.test(term)
            ? 6
            : weak.has(term)
              ? 1
              : term === "cursor"
                ? 6
                : term.length >= 5 || term === "rate"
                  ? 4
                  : 2;
      return [{ term, start: match.index, weight }];
    });
  const questionTerms = new Map(
    tokens(question)
      .filter((hit) => hit.weight >= 3)
      .map((hit) => [hit.term, hit.weight]),
  );
  const query = new Map<string, number>();
  for (const hit of tokens(target.text.slice(0, 5000)))
    query.set(hit.term, hit.weight);
  for (const hit of tokens(question))
    query.set(
      hit.term,
      Math.max(
        query.get(hit.term) ?? 0,
        hit.weight >= 3 ? hit.weight * 2 : hit.weight,
      ),
    );
  for (const quoted of `${question} ${target.text.slice(0, 5000)}`.matchAll(
    /["“'`]([^"”'`]{2,80})["”'`]/gu,
  ))
    for (const hit of tokens(quoted[1]))
      query.set(hit.term, Math.max(query.get(hit.term) ?? 0, hit.weight + 2));
  if (!query.size) return [];
  return doc.sources
    .flatMap((source, index) => {
      const body = source.text.slice(0, 8000);
      if (!body.trim()) return [];
      const titleHits = tokens(source.title).filter((hit) =>
        query.has(hit.term),
      );
      const titleTerms = new Set(titleHits.map((hit) => hit.term));
      const titleScore = [...titleTerms].reduce(
        (score, term) => score + (query.get(term) ?? 0) * 2,
        0,
      );
      const hits = tokens(body)
        .filter((hit) => query.has(hit.term))
        .map((hit) => ({ ...hit, weight: query.get(hit.term)! }));
      const maxStart = Math.max(0, body.length - 1500);
      let bestStart = 0,
        bestScore = 0,
        left = 0,
        right = 0,
        windowScore = 0;
      const counts = new Map<string, number>();
      for (const anchor of hits) {
        const start = Math.min(maxStart, Math.max(0, anchor.start - 750));
        while (right < hits.length && hits[right].start < start + 1500) {
          const hit = hits[right++],
            count = counts.get(hit.term) ?? 0;
          if (count < 2) windowScore += hit.weight + (count === 0 ? 2 : 0);
          counts.set(hit.term, count + 1);
        }
        while (left < right && hits[left].start < start) {
          const hit = hits[left++],
            count = counts.get(hit.term)!;
          if (count <= 2) windowScore -= hit.weight + (count === 1 ? 2 : 0);
          counts.set(hit.term, count - 1);
        }
        if (windowScore > bestScore) {
          bestScore = windowScore;
          bestStart = start;
        }
      }
      const strongBody = hits.some((hit) => hit.weight >= 3);
      const strongTitle =
        [...titleTerms].filter((term) => (query.get(term) ?? 0) >= 3).length >=
        2;
      const score = titleScore + bestScore;
      const questionMatches = new Set(
        [...titleHits, ...hits]
          .map((hit) => hit.term)
          .filter((term) => questionTerms.has(term)),
      );
      const questionScore =
        questionMatches.size >= 2
          ? [...questionMatches].reduce(
              (total, term) => total + questionTerms.get(term)!,
              0,
            )
          : 0;
      if (score < 8 || (!strongBody && !strongTitle)) return [];
      let start = bestStart;
      const before = Math.max(
        ...["\n", ". ", "! ", "? "].map((mark) => {
          const index = body.lastIndexOf(mark, start);
          return index < 0 ? -1 : index + mark.length - 1;
        }),
      );
      if (start > 0 && before >= start - 60) start = before + 1;
      else if (
        start > 0 &&
        /[\p{L}\p{N}]/u.test(body[start - 1]) &&
        /[\p{L}\p{N}]/u.test(body[start])
      ) {
        const next = body.indexOf(" ", start);
        if (next >= 0 && next - start < 60) start = next + 1;
      }
      let end = Math.min(body.length, start + 1500);
      const after = Math.max(
        ...["\n", ". ", "! ", "? "].map((mark) => {
          const index = body.lastIndexOf(mark, end);
          return index < 0 ? -1 : index + mark.length;
        }),
      );
      if (
        end < body.length &&
        after <= end &&
        after > start + 100 &&
        after >= end - 60
      )
        end = after;
      else if (
        end < body.length &&
        /[\p{L}\p{N}]/u.test(body[end - 1]) &&
        /[\p{L}\p{N}]/u.test(body[end])
      ) {
        const previous = body.lastIndexOf(" ", end);
        if (previous > end - 60) end = previous;
      }
      const excerpt = body.slice(start, end);
      return [
        {
          index,
          score,
          questionScore,
          titleScore,
          bodyScore: bestScore,
          source: {
            title: source.title.slice(0, 240),
            kind: source.kind,
            excerpt,
            truncated: start > 0 || end < source.text.length,
          },
        },
      ];
    })
    .sort(
      (a, b) =>
        b.questionScore - a.questionScore ||
        b.score - a.score ||
        b.titleScore - a.titleScore ||
        b.bodyScore - a.bodyScore ||
        a.index - b.index,
    )
    .slice(0, 3)
    .map((item) => item.source);
}
export function authoredDraftState(doc: Document): string {
  return JSON.stringify(
    doc.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      label: section.label,
      placement: section.placement,
      content: section.content,
    })),
  );
}
export function hasAuthoredDraftChange(
  before: Document,
  after: Document,
): boolean {
  return authoredDraftState(before) !== authoredDraftState(after);
}
export const styleDNASchema = z.object({
  sentenceLengths: z
    .string()
    .default("Vary naturally. Short fragments can sit next to long sentences."),
  rhythm: z
    .string()
    .default("Preserve my cadence; do not mechanically balance it."),
  fragments: z.boolean().default(true),
  profanity: z.enum(["preserve", "avoid", "welcome"]).default("preserve"),
  humor: z.string().default("Only when grounded in my observation."),
  transitions: z
    .string()
    .default("Prefer specific connections, not stock bridges."),
  endingStyles: z.string().default("Stop when the job is done."),
  callbackUsage: z.string().default("Only earned callbacks."),
  explanationDepth: z
    .string()
    .default("Enough to understand, not a compulsory summary."),
  technicality: z.string().default("Precise, with necessary terms explained."),
  slangLevel: z
    .string()
    .default("Preserve mine; do not insert unapproved slang."),
  favoriteWords: z.array(z.string()).default([]),
  favoriteRhetoric: z.array(z.string()).default([]),
  dislikedPhrases: z
    .array(z.string())
    .default([
      "Here's the thing",
      "Let's dive in",
      "In today's fast-paced world",
      "game-changing",
      "unlock",
    ]),
  cornyPhrases: z
    .array(z.string())
    .default(["But there’s more", "It’s not just X, it’s Y"]),
  neverSuggest: z.array(z.string()).default([]),
  punctuation: z.string().default("Keep intentional punctuation."),
  metaphors: z.string().default("Specific, not decorative."),
  register: z.string().default("My own voice"),
});
export type StyleDNA = z.infer<typeof styleDNASchema>;
export const knowledgePackSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  principles: z.string(),
});
export type KnowledgePack = z.infer<typeof knowledgePackSchema>;
export const radarItemSchema = z.object({
  id: z.string(),
  term: z.string(),
  meaning: z.string(),
  mechanism: z.string(),
  pattern: z.string(),
  seriousUsage: z.string(),
  ironicUsage: z.string(),
  exampleStructure: z.string(),
  relatedTerms: z.array(z.string()),
  caveat: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })),
  discoveredAt: z.string(),
  lastVerifiedAt: z.string(),
  status: z.enum(["saved", "maybe", "dislike", "never_suggest"]),
});
export type LanguageRadarItem = z.infer<typeof radarItemSchema>;
export const settingsSchema = z.object({
  activeDocumentId: z.string().nullable().default(null),
  layout: z
    .object({
      primaryView: z.enum(["workbench", "document"]).default("workbench"),
      density: z.enum(["comfortable", "overview"]).default("comfortable"),
      workbenchVisible: z.boolean().default(true),
      previewVisible: z.boolean().default(true),
      inspectorVisible: z.boolean().default(true),
      paneWidths: z
        .object({
          workbench: z.number().min(10).max(80),
          preview: z.number().min(10).max(80),
          inspector: z.number().min(10).max(80),
        })
        .default({ workbench: 50, preview: 30, inspector: 20 }),
    })
    .optional(),
  styleDNA: styleDNASchema,
  knowledgePacks: z.array(knowledgePackSchema),
  radar: z.array(radarItemSchema),
  theme: z.enum(["light", "dark"]).default("light"),
  routing: routingPreferencesSchema.optional(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const writingActions = [
  "coach",
  "critique",
  "shorten",
  "lengthen",
  "simplify",
  "concrete",
  "rhythm",
  "emotion",
  "specificity",
  "directness",
  "register",
  "figurative",
  "reveal",
  "tension",
  "suspense",
  "humor",
  "exaggeration",
  "technical",
  "technical_writing",
  "words",
  "spellcheck",
  "split",
  "combine",
  "reference_flip",
  "break_template",
  "structure",
] as const;
export type WritingAction = (typeof writingActions)[number];
export const aiContextSchema = z.object({
  personalLibrary: personalLibrarySchema.optional(),
  resolvedStyle: resolvedWritingStyleSchema.optional(),
  document: documentSchema,
  styleDNA: styleDNASchema,
  knowledgePacks: z.array(knowledgePackSchema),
  approvedLanguage: z.array(radarItemSchema),
});
export type AIContext = z.infer<typeof aiContextSchema>;
export function requestedVariantShape(
  instruction: string,
): { min: number; max: number } | null {
  const count = (value: string) =>
    ({ one: 1, two: 2, three: 3, four: 4, five: 5 })[
      value.toLowerCase() as "one" | "two" | "three" | "four" | "five"
    ];
  const range = instruction.match(
    /\b(one|two|three|four|five)\s+or\s+(one|two|three|four|five)\s+(?:short\s+)?(?:bridges?|variants?|options?|alternatives?)\b/i,
  );
  if (range)
    return {
      min: Math.min(count(range[1]), count(range[2])),
      max: Math.max(count(range[1]), count(range[2])),
    };
  const exact = instruction.match(
    /\b(one|two|three|four|five)\s+(?:short\s+)?(?:bridges?|variants?|options?|alternatives?)\b/i,
  );
  return exact ? { min: count(exact[1]), max: count(exact[1]) } : null;
}
export const aiRequestSchema = z.object({
  structure: structureRequestSchema.optional(),
  readContext: aiContextSchema,
  editTarget: editTargetSchema,
  action: z.enum(writingActions),
  stage: z.enum(["diagnose", "propose"]),
  instruction: z.string().max(10000).default(""),
  answer: z.string().max(30000).default(""),
  controls: z
    .record(z.union([z.string(), z.number(), z.boolean()]))
    .default({}),
  variantCount: z.number().int().min(1).max(5).default(2),
  modelOverride: modelRefSchema.nullable().optional(),
  lens: lensOptionsSchema.optional(),
  explicitGuidance: z.array(savedGuidanceSchema).max(3).optional(),
  explicitBriefContext: z.array(savedBriefContextSchema).max(3).optional(),
  technicalContext: technicalContextSchema.optional(),
  technicalSources: z.array(technicalSourceSchema).max(3).optional(),
  technicalSourceCount: z.number().int().min(0).optional(),
  followUp: z
    .object({
      runId: z.string().min(1),
      question: z.string().trim().min(1).max(3000),
      originalInstruction: z.string(),
      originalResult: z.object({
        diagnosis: z.string(),
        mechanism: z.string(),
        question: z.string(),
      }),
      turns: z.array(labConversationTurnSchema).max(24),
      targetStatus: z.enum(["exact", "changed"]),
    })
    .optional(),
});
export type AIRequest = z.infer<typeof aiRequestSchema>;
export type AIState =
  | "idle"
  | "target_identified"
  | "diagnosing"
  | "asking"
  | "proposing"
  | "preview"
  | "accepted"
  | "rejected"
  | "error";
export interface LLMProvider {
  readonly name: string;
  readonly capabilities: {
    webResearch: boolean;
    structuredGeneration: boolean;
  };
  run(request: AIRequest): Promise<AIResponse>;
  researchCulture(query: string): Promise<LanguageRadarItem[]>;
}

export function uid(): string {
  return globalThis.crypto.randomUUID();
}
export function paragraphs(text: string): RichNode[] {
  return text.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
}
function inlineText(node: RichNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.text !== undefined) return node.text;
  const separator = [
    "bulletList",
    "orderedList",
    "blockquote",
    "listItem",
  ].includes(node.type)
    ? "\n"
    : "";
  return (node.content ?? []).map(inlineText).join(separator);
}
export function sectionText(section: Pick<WritingSection, "content">): string {
  return section.content.map(inlineText).join("\n");
}
export function draftSections(
  doc: Pick<Document, "sections">,
): WritingSection[] {
  return doc.sections.filter((section) => section.placement !== "parked");
}
export function parkedSections(
  doc: Pick<Document, "sections">,
): WritingSection[] {
  return doc.sections.filter((section) => section.placement === "parked");
}
export type AssembledPiece = { title: string; sections: RichNode[][] };
export function assemblePiece(doc: Document): AssembledPiece {
  return {
    title: doc.title.trim() || "Untitled",
    sections: draftSections(doc)
      .filter((section) => sectionText(section).trim())
      .map((section) => section.content),
  };
}
export function renderPieceText(piece: AssembledPiece, title = false): string {
  const readable = (node: RichNode): string => {
    if (node.type === "bulletList" || node.type === "orderedList")
      return (node.content ?? [])
        .map((item, index) => {
          const marker =
            node.type === "bulletList"
              ? "- "
              : `${Number(node.attrs?.start ?? 1) + index}. `;
          return (
            marker +
            (item.content ?? []).map(readable).join("\n").replace(/\n/g, "\n  ")
          );
        })
        .join("\n");
    return inlineText(node);
  };
  const body = piece.sections
    .map((section) => section.map(readable).join("\n"))
    .join("\n\n");
  return title ? `${piece.title}${body ? `\n\n${body}` : ""}` : body;
}
export function documentText(doc: Document): string {
  return renderPieceText(assemblePiece(doc));
}
export function newSection(
  kind: WritingSection["kind"] = "Freeform",
  text = "",
): WritingSection {
  return {
    id: uid(),
    kind,
    label: kind,
    placement: "draft",
    parkedGroupId: null,
    lastParkedGroupId: null,
    content: paragraphs(text),
    notes: "",
    variants: [],
  };
}
export function newDocument(title = "Untitled", text = ""): Document {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    title,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    draftRevision: 0,
    brief: writingBriefSchema.parse({}),
    pieceMemory: pieceMemorySchema.parse({}),
    guidanceDismissals: [],
    revisionPlan: [],
    sections: [newSection("Freeform", text)],
    parkedGroups: [],
    sources: [],
    history: [],
    revisionTrail: [],
  };
}
export function targetFor(
  doc: Document,
  sectionId: string,
  scope: EditTarget["scope"] = "section",
  start = 0,
  end?: number,
): EditTarget {
  const section = doc.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error("Section not found");
  const text = sectionText(section);
  return {
    scope,
    sectionId,
    start,
    end: end ?? text.length,
    text: text.slice(start, end ?? text.length),
    sectionSnapshot: text,
    documentId: doc.id,
    documentRevision: doc.revision,
  };
}
export function documentTarget(doc: Document): EditTarget {
  return {
    scope: "document",
    sectionId: null,
    start: 0,
    end: documentText(doc).length,
    text: documentText(doc),
    sectionSnapshot: "",
    documentId: doc.id,
    documentRevision: doc.revision,
  };
}
/** Permission boundary: context is readable, never implicitly editable. Reject stale anchors rather than guessing. */
export function validateTarget(doc: Document, target: EditTarget): void {
  if (target.documentId !== doc.id)
    throw new Error("Target belongs to a different document");
  if (target.scope === "document") {
    if (target.text !== documentText(doc))
      throw new Error("Document changed; analyze again");
    return;
  }
  const section = doc.sections.find((s) => s.id === target.sectionId);
  if (!section) throw new Error("Target section no longer exists");
  const text = sectionText(section);
  if (text !== target.sectionSnapshot)
    throw new Error(
      "This section changed. Select the text again before applying.",
    );
  if (
    target.start > target.end ||
    target.end > text.length ||
    text.slice(target.start, target.end) !== target.text
  )
    throw new Error("Invalid target range");
  if (
    target.scope === "section" &&
    (target.start !== 0 || target.end !== text.length)
  )
    throw new Error("Section target must span that section");
}
export type TargetResolution =
  | { status: "exact" | "changed"; current: EditTarget }
  | { status: "unresolved"; current: null };
export function resolveHistoricalTarget(
  doc: Document,
  target: EditTarget,
): TargetResolution {
  const unresolved: TargetResolution = { status: "unresolved", current: null };
  if (target.documentId !== doc.id || !target.sectionId) return unresolved;
  const section = doc.sections.find((item) => item.id === target.sectionId);
  if (!section) return unresolved;
  const text = sectionText(section);
  if (target.scope === "section")
    return {
      status: text === target.sectionSnapshot ? "exact" : "changed",
      current: targetFor(doc, section.id),
    };
  if (target.scope !== "selection" && target.scope !== "word")
    return unresolved;
  const old = target.sectionSnapshot;
  if (!target.text || old.slice(target.start, target.end) !== target.text)
    return unresolved;
  const currentTarget = (start: number, end: number): EditTarget => ({
    ...targetFor(
      doc,
      section.id,
      target.scope === "word" && /\s/.test(text.slice(start, end))
        ? "selection"
        : target.scope,
      start,
      end,
    ),
    ...(target.unit ? { unit: target.unit } : {}),
  });
  if (text.slice(target.start, target.end) === target.text)
    return {
      status: "exact",
      current: currentTarget(target.start, target.end),
    };
  const left = old.slice(Math.max(0, target.start - 32), target.start);
  const right = old.slice(target.end, target.end + 32);
  const unique = (anchor: string) => {
    const index = text.indexOf(anchor);
    return anchor.trim().length >= 8 &&
      index >= 0 &&
      text.indexOf(anchor, index + 1) < 0
      ? index
      : -1;
  };
  const literal = text.indexOf(target.text);
  if (
    literal >= 0 &&
    text.indexOf(target.text, literal + 1) < 0 &&
    ((left.trim().length >= 8 &&
      text.slice(Math.max(0, literal - left.length), literal) === left) ||
      (right.trim().length >= 8 &&
        text.slice(
          literal + target.text.length,
          literal + target.text.length + right.length,
        ) === right))
  )
    return {
      status: "exact",
      current: currentTarget(literal, literal + target.text.length),
    };
  const leftIndex = target.start === 0 ? -1 : unique(left);
  const rightIndex = target.end === old.length ? -1 : unique(right);
  if (
    (target.start > 0 && leftIndex < 0) ||
    (target.end < old.length && rightIndex < 0) ||
    (leftIndex < 0 && rightIndex < 0)
  )
    return unresolved;
  const start = leftIndex < 0 ? 0 : leftIndex + left.length;
  const end = rightIndex < 0 ? text.length : rightIndex;
  const passage = text.slice(start, end);
  if (end <= start || passage.length > target.text.length * 3 + 60)
    return unresolved;
  if (
    (leftIndex < 0 || rightIndex < 0) &&
    (passage.match(/[.!?](?:\s|$)/g) ?? []).length !==
      (target.text.match(/[.!?](?:\s|$)/g) ?? []).length
  )
    return unresolved;
  return { status: "changed", current: currentTarget(start, end) };
}
export function validateAIRequest(req: AIRequest): void {
  if (req.followUp) {
    const target = req.editTarget;
    if (
      target.documentId !== req.readContext.document.id ||
      !target.sectionId ||
      !req.readContext.document.sections.some(
        (section) =>
          section.id === target.sectionId &&
          section.workbench?.runs.some(
            (run) =>
              run.id === req.followUp?.runId &&
              JSON.stringify(run.target) === JSON.stringify(target),
          ),
      )
    )
      throw new Error(
        "Follow-up must remain attached to the saved run's target",
      );
    if (
      target.start > target.end ||
      target.sectionSnapshot.slice(target.start, target.end) !== target.text ||
      (target.scope === "section" &&
        (target.start !== 0 || target.end !== target.sectionSnapshot.length))
    )
      throw new Error("Invalid saved target range");
    if (
      resolveHistoricalTarget(req.readContext.document, target).status !==
      req.followUp.targetStatus
    )
      throw new Error("Saved target status changed; inspect this run again");
    if (req.stage === "propose" && req.followUp.targetStatus !== "exact")
      throw new Error(
        "Select the current passage for a new run before proposing options",
      );
  } else validateTarget(req.readContext.document, req.editTarget);
  if (
    req.editTarget.scope === "document" &&
    !["critique", "break_template", "technical_writing"].includes(req.action)
  )
    throw new Error(
      "Document scope is analysis-only. Select a section or sentence to propose an edit.",
    );
  if (
    req.stage === "propose" &&
    !["words", "spellcheck", "critique", "break_template"].includes(
      req.action,
    ) &&
    !req.answer.trim()
  )
    throw new Error(
      "Add your own material or direction before requesting creative proposals.",
    );
}
/** Copyable Markdown; headings and emphasis retained. */
export function renderPieceMarkdown(
  piece: AssembledPiece,
  title = true,
): string {
  const render = (n: RichNode): string => {
    if (n.text !== undefined) {
      let t = n.text.replace(/([\\`*_{}\[\]<>])/g, "\\$1");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        if (m.type === "italic") t = `*${t}*`;
        if (m.type === "code") {
          const longest = Math.max(
            0,
            ...(n.text.match(/`+/g) ?? []).map((ticks) => ticks.length),
          );
          const fence = "`".repeat(longest + 1);
          t = `${fence}${n.text}${fence}`;
        }
        if (
          m.type === "link" &&
          typeof m.attrs?.href === "string" &&
          URL.canParse(m.attrs.href)
        ) {
          const url = new URL(m.attrs.href);
          if (["http:", "https:"].includes(url.protocol))
            t = `[${t}](${url.href.replace(/[()]/g, (c) => encodeURIComponent(c))})`;
        }
      }
      return t;
    }
    if (n.type === "hardBreak") return "  \n";
    if (n.type === "codeBlock") {
      const content = (n.content ?? []).map(inlineText).join("\n");
      const longest = Math.max(
        0,
        ...(content.match(/`+/g) ?? []).map((ticks) => ticks.length),
      );
      const fence = "`".repeat(Math.max(3, longest + 1));
      const language =
        typeof n.attrs?.language === "string" &&
        /^[\w+.-]{1,32}$/.test(n.attrs.language)
          ? n.attrs.language
          : "";
      return `${fence}${language}\n${content}\n${fence}`;
    }
    if (n.type === "bulletList" || n.type === "orderedList")
      return (n.content ?? [])
        .map((item, index) => {
          const text = (item.content ?? []).map(render).join("\n");
          const marker =
            n.type === "bulletList"
              ? "- "
              : `${Number(n.attrs?.start ?? 1) + index}. `;
          return marker + text.replace(/\n/g, "\n  ");
        })
        .join("\n");
    if (n.type === "blockquote")
      return (n.content ?? [])
        .map(render)
        .join("\n\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    const t = (n.content ?? []).map(render).join("");
    if (n.type === "heading")
      return (
        "#".repeat(Math.min(6, Math.max(1, Number(n.attrs?.level ?? 2)))) +
        " " +
        t
      );
    return t;
  };
  const body = piece.sections
    .map((section) => section.map(render).join("\n\n"))
    .join("\n\n");
  return title
    ? `# ${piece.title.replace(/([\\`*_{}\[\]<>#|])/g, "\\$1")}\n\n${body}`.trimEnd()
    : body;
}
export function toMarkdown(doc: Document): string {
  return renderPieceMarkdown(assemblePiece(doc), false);
}
export type ControlConfig = {
  key: string;
  label: string;
  low: string;
  high: string;
};
export type WritingLab = {
  title: string;
  strategy: string;
  question: string;
  controls: ControlConfig[];
  actions: WritingAction[];
};
const controls: Record<string, ControlConfig> = {
  intensity: {
    key: "intensity",
    label: "Intensity",
    low: "quiet",
    high: "charged",
  },
  length: {
    key: "length",
    label: "Length",
    low: "compressed",
    high: "expansive",
  },
  reveal: { key: "reveal", label: "Reveal", low: "withhold", high: "show" },
  specificity: {
    key: "specificity",
    label: "Specificity",
    low: "broad",
    high: "concrete",
  },
  directness: {
    key: "directness",
    label: "Directness",
    low: "subtle",
    high: "direct",
  },
  humor: { key: "humor", label: "Humor", low: "serious", high: "absurd" },
  rhythm: { key: "rhythm", label: "Rhythm", low: "measured", high: "staccato" },
  register: {
    key: "register",
    label: "Register",
    low: "conversational",
    high: "technical",
  },
  finality: {
    key: "finality",
    label: "Finality",
    low: "open",
    high: "resolved",
  },
};
const lab = (
  title: string,
  strategy: string,
  question: string,
  keys: string[],
  actions: WritingAction[],
): WritingLab => ({
  title,
  strategy,
  question,
  controls: keys.map((k) => controls[k]),
  actions,
});
export const labs: Record<string, WritingLab> = {
  title: lab(
    "Title workbench",
    "A title makes a specific promise. Decide whether to name the subject or withhold an earned detail.",
    "What should the reader know, and what are you willing to leave unanswered?",
    ["directness", "specificity", "humor"],
    ["coach", "shorten", "humor", "technical"],
  ),
  hook: lab(
    "Hook workbench",
    "Curiosity comes from a meaningful gap, not empty intensity. Anchor the opening in something you actually noticed.",
    "What real detail or contradiction earns this opening?",
    ["intensity", "reveal", "specificity", "humor"],
    ["coach", "shorten", "tension", "humor", "exaggeration"],
  ),
  segue: lab(
    "Segue workbench",
    "A bridge carries an idea forward. Contrast, consequence, a callback, or a deliberate interruption can make that connection.",
    "What idea must survive from the previous section into the next?",
    ["directness", "length", "reveal", "humor"],
    ["coach", "shorten", "reveal", "figurative", "rhythm"],
  ),
  ending: lab(
    "Ending workbench",
    "An ending controls the aftertaste. It may resolve, echo, interrupt, or leave a question alive; it need not summarize.",
    "What should remain with the reader after the final word?",
    ["finality", "length", "intensity", "humor"],
    ["coach", "shorten", "reveal", "humor", "tension"],
  ),
  body: lab(
    "Language workbench",
    "Choose the job of this exact passage. Concrete evidence, a clean explanation, and a deliberate pause do different work.",
    "What do you want this passage to do, in your own words?",
    ["specificity", "directness", "register", "rhythm"],
    [
      "coach",
      "shorten",
      "lengthen",
      "simplify",
      "concrete",
      "technical",
      "rhythm",
      "emotion",
      "humor",
      "spellcheck",
    ],
  ),
  word: lab(
    "Word intelligence",
    "Near-synonyms make different claims. Inspect meaning, connotation, and register before changing the word.",
    "What shade of meaning are you reaching for?",
    ["register", "intensity"],
    ["words", "coach", "register"],
  ),
};
export function labFor(kind: string, scope: EditTarget["scope"]): WritingLab {
  if (scope === "word") return labs.word;
  if (scope === "selection") return labs.body;
  if (["Title", "Headline", "Subtitle"].includes(kind)) return labs.title;
  if (["Hook", "Cold Open"].includes(kind)) return labs.hook;
  if (["Segue", "Transition"].includes(kind)) return labs.segue;
  if (
    [
      "Closer",
      "Conclusion",
      "Sign-off",
      "Cliffhanger",
      "To Be Continued",
      "Punchline",
    ].includes(kind)
  )
    return labs.ending;
  return labs.body;
}
export const contentTypeConfig: Record<
  WritingBrief["contentType"],
  { label: string; units: string[]; guidance: string }
> = {
  narration: {
    label: "Narration / video script",
    units: ["Cold Open", "Setup", "Beat", "Reveal", "Callback", "Ending"],
    guidance:
      "Speakable language. Preserve breath, fragments and dramatic pauses.",
  },
  article: {
    label: "Article",
    units: ["Headline", "Opening", "Context", "Evidence", "Kicker"],
    guidance: "Make an argument legible without prescribing a template.",
  },
  post: {
    label: "Post",
    units: ["Observation", "Point"],
    guidance: "Four words can be complete. Do not assume a viral formula.",
  },
  reply: {
    label: "Reply / comment",
    units: ["Reaction"],
    guidance: "Keep the source separate. One sentence may be enough.",
  },
  quote_repost: {
    label: "Quote / repost",
    units: ["Context", "Reaction"],
    guidance: "Separate what was said from your interpretation.",
  },
  clip_commentary: {
    label: "Clip commentary",
    units: ["Hook", "Context", "Reaction", "Closer"],
    guidance: "Keep the transcript intact. Work the framing independently.",
  },
  thread: {
    label: "Thread",
    units: ["Entry"],
    guidance: "Independent entries; never split automatically.",
  },
  announcement: {
    label: "Announcement",
    units: ["Point", "Context"],
    guidance: "What it is and why it matters, without corporate copy.",
  },
  marketing: {
    label: "Marketing / selling",
    units: ["Point", "Evidence", "Closer"],
    guidance: "Use persuasion intentionally. No stock formula by default.",
  },
  story: {
    label: "Story",
    units: ["Scene", "Beat", "Reveal"],
    guidance: "Preserve voice, implication, and intentional asymmetry.",
  },
  tutorial: {
    label: "Tutorial",
    units: [],
    guidance:
      "Learning through doing can build a mental model; progression is a choice, not a required outline.",
  },
  how_to: {
    label: "How-to guide",
    units: [],
    guidance:
      "A reader with a goal may value the shortest trustworthy route; explain detours when they protect understanding.",
  },
  quick_start: {
    label: "Quick start",
    units: [],
    guidance:
      "Time to first success matters, unless earlier framing prevents a costly misunderstanding.",
  },
  explanation: {
    label: "Explanation / conceptual guide",
    units: [],
    guidance:
      "Causality and mental models may matter more than procedural speed.",
  },
  reference: {
    label: "Reference",
    units: [],
    guidance:
      "Lookup, precision and conditions matter; narrative can help when it earns its place.",
  },
  api_reference: {
    label: "API reference",
    units: [],
    guidance:
      "Look for exact conditions, scope and lookup paths, without inventing API behavior.",
  },
  troubleshooting: {
    label: "Troubleshooting guide",
    units: [],
    guidance:
      "Symptoms, evidence, competing causes and recovery may matter more than a single happy path.",
  },
  readme: {
    label: "README / setup guide",
    units: [],
    guidance:
      "Consider the starting assumptions, a useful first result and ways to verify it.",
  },
  architecture: {
    label: "Architecture document",
    units: [],
    guidance:
      "Constraints, interfaces, alternatives and failure modes can clarify a design without prescribing an outline.",
  },
  engineering_decision: {
    label: "Engineering decision / proposal",
    units: [],
    guidance:
      "State the decision context and the consequences readers need, including unresolved tradeoffs.",
  },
  technical_talk: {
    label: "Technical talk",
    units: [],
    guidance:
      "Pacing, demos, analogies, story and callbacks can support spoken comprehension.",
  },
  freeform: {
    label: "Freeform",
    units: ["Freeform"],
    guidance: "No prescribed shape. Stop when the communication job is done.",
  },
};
export const structuralMechanisms = [
  {
    name: "Begin with consequence",
    effect:
      "Put the stakes before the cause. The reader works backward to understand why.",
  },
  {
    name: "Open on a strange detail",
    effect:
      "Let one observed detail carry curiosity. Supply the real detail; do not fabricate one.",
  },
  {
    name: "Conclusion first",
    effect: "Give the point away, then make the reasoning worth reading.",
  },
  {
    name: "Remove the formal hook",
    effect:
      "Start with the observation itself. Not every piece needs a performance at the door.",
  },
  {
    name: "Circular return",
    effect:
      "Return to an opening image with a changed meaning, not a repeated summary.",
  },
  {
    name: "Deliberate asymmetry",
    effect:
      "Let sections take the space they need. Do not force equal lengths or rhetorical triples.",
  },
  {
    name: "Enter halfway through",
    effect:
      "Begin inside an actual moment, then reveal only the context the reader needs.",
  },
  {
    name: "Organize around a reveal",
    effect:
      "Order known material by what the reader should understand at each moment.",
  },
];
export function technicalRunControls(
  controls: SectionWorkbench["controls"],
  selectedControlKeys?: string[],
): SectionWorkbench["controls"] {
  const filtered = { ...controls };
  if (
    filtered.mechanism === structuralMechanisms[0].name &&
    !selectedControlKeys?.includes("mechanism")
  )
    delete filtered.mechanism;
  return filtered;
}
export const defaultPacks: KnowledgePack[] = [
  [
    "technical",
    "Technical Writing",
    "Name assumptions. Define necessary terms. Prefer concrete examples and precise scope. Never invent evidence.",
  ],
  [
    "story",
    "Storytelling",
    "Scenes, distance, implication and setup/payoff are tools, not required beats. Ask for the actual experience.",
  ],
  [
    "persuasion",
    "Copywriting / Persuasion",
    "Separate claims from proof. Consider objections. Use named frameworks only with explicit permission.",
  ],
  [
    "emotion",
    "Emotion",
    "Behavior and detail can carry feeling better than emotion labels. Ask for observable material.",
  ],
  [
    "comedy",
    "Comedy",
    "Explain misdirection, understatement, contrast and callbacks. Ground exaggeration in the human observation. Never explain away a joke.",
  ],
  [
    "internet",
    "Internet Writing",
    "Distinguish serious and ironic constructions. Date-check current references and never insert unapproved slang.",
  ],
  [
    "grammar",
    "Grammar / Punctuation",
    "Differentiate accidental errors from intentional fragments. Punctuation changes emphasis and cadence; correctness is not conformity.",
  ],
  [
    "rhetoric",
    "Rhetoric",
    "Parallelism, metaphor, irony and repetition are mechanisms, not defaults. Ask whether recurring patterns are intentional.",
  ],
].map(([id, name, principles]) => ({ id, name, principles, enabled: true }));
export function defaultSettings(): Settings {
  return {
    activeDocumentId: null,
    styleDNA: styleDNASchema.parse({}),
    knowledgePacks: defaultPacks.map((p) => ({ ...p })),
    radar: [],
    theme: "light",
  };
}

export * from "./composition-knowledge";

export * from "./section-operations";
