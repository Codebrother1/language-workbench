import {
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
export const workbenchRunSchema = z.object({
  structure: structureRequestSchema.optional(),
  lens: lensOptionsSchema.optional(),
  id: z.string(),
  createdAt: z.string(),
  target: editTargetSchema,
  action: z.string(),
  instruction: z.string(),
  answer: z.string(),
  controls: z.record(z.union([z.string(), z.number(), z.boolean()])),
  model: modelRefSchema.nullable(),
  response: aiResponseSchema.extend({
    model: modelRefSchema.optional(),
    routeSource: z.string().optional(),
  }),
});
export type WorkbenchRun = z.infer<typeof workbenchRunSchema>;
export const sectionWorkbenchSchema = z.object({
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
  lens: lensOptionsSchema.default({}),
  oneOffModel: modelRefSchema.nullable().default(null),
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
  kind: z.enum([
    "text",
    "comment",
    "quote",
    "transcript",
    "article",
    "repo",
    "notes",
    "other",
  ]),
  text: z.string(),
  url: z.string().default(""),
});
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string(),
    title: z.string().min(1).max(240),
    createdAt: z.string(),
    updatedAt: z.string(),
    revision: z.number().int().min(0),
    brief: writingBriefSchema,
    sections: z.array(writingSectionSchema).min(1),
    parkedGroups: z.array(parkedGroupSchema).default([]),
    sources: z.array(sourceMaterialSchema).default([]),
    history: z.array(iterationSchema).default([]),
    focusTarget: editTargetSchema.nullable().optional(),
    defaultModel: modelRefSchema.nullable().optional(),
    workbench: sectionWorkbenchSchema.optional(),
  })
  .refine(
    (doc) =>
      doc.sections.every((s) => s.id.trim().length > 0) &&
      new Set(doc.sections.map((s) => s.id)).size === doc.sections.length &&
      new Set(doc.parkedGroups.map((g) => g.id)).size ===
        doc.parkedGroups.length &&
      doc.sections.every(
        (s) =>
          s.placement !== "parked" ||
          !s.parkedGroupId ||
          doc.parkedGroups.some((g) => g.id === s.parkedGroupId),
      ),
    { message: "Section and parked-group references must be valid." },
  );
export type Document = z.infer<typeof documentSchema>;
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
export function documentText(doc: Document): string {
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
  return draftSections(doc)
    .map((section) => section.content.map(readable).join("\n"))
    .join("\n\n");
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
    brief: writingBriefSchema.parse({}),
    sections: [newSection("Freeform", text)],
    parkedGroups: [],
    sources: [],
    history: [],
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
export function validateAIRequest(req: AIRequest): void {
  validateTarget(req.readContext.document, req.editTarget);
  if (
    req.editTarget.scope === "document" &&
    !["critique", "break_template"].includes(req.action)
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
export function toMarkdown(doc: Document): string {
  const render = (n: RichNode): string => {
    if (n.text !== undefined) {
      let t = n.text;
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        if (m.type === "italic") t = `*${t}*`;
        if (m.type === "code") t = "`" + t + "`";
      }
      return t;
    }
    if (n.type === "hardBreak") return "  \n";
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
    const t = (n.content ?? []).map(render).join("");
    if (n.type === "heading")
      return "#".repeat(Number(n.attrs?.level ?? 2)) + " " + t;
    if (n.type === "blockquote") return "> " + t;
    return t;
  };
  return draftSections(doc)
    .map((s) => s.content.map(render).join("\n\n"))
    .join("\n\n");
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
    styleDNA: styleDNASchema.parse({}),
    knowledgePacks: defaultPacks.map((p) => ({ ...p })),
    radar: [],
    theme: "light",
  };
}

export * from "./composition-knowledge";

export * from "./section-operations";
