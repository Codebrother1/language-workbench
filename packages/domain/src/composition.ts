import { z } from "zod";
export const relationshipIds = [
  "add",
  "contrast",
  "concede",
  "cause",
  "result",
  "example",
  "clarify",
  "qualify",
  "escalate",
  "pivot",
  "return",
  "reveal",
  "compare",
  "condition",
  "sequence",
  "exception",
  "emphasis",
] as const;
export type RelationshipId = (typeof relationshipIds)[number];
export const writingRegisters = [
  "any",
  "conversational",
  "formal",
  "technical",
  "sharp",
] as const;
export type StructureRegister = (typeof writingRegisters)[number];
export const structureDraftSchema = z.object({
  customTemplate: z.string().default(""),
  raw: z.string().default(""),
  units: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        start: z.number().int().min(0),
        end: z.number().int().min(0),
      }),
    )
    .default([]),
  thoughtA: z.string().default(""),
  thoughtB: z.string().default(""),
  optionalSlot: z.string().default(""),
  relationship: z.enum(relationshipIds).default("contrast"),
  register: z.enum(writingRegisters).default("conversational"),
  connectorId: z.string().default(""),
  scaffoldId: z.string().default(""),
  purpose: z
    .enum([
      "qualifier",
      "example",
      "consequence",
      "aside",
      "punchline",
      "reveal",
    ])
    .default("qualifier"),
});
export type StructureDraft = z.infer<typeof structureDraftSchema>;
export const emptyStructure = (): StructureDraft =>
  structureDraftSchema.parse({});
export const structureRequestSchema = z.object({
  mode: z.enum(["analyze", "critique", "tighten"]),
  draft: structureDraftSchema,
  scaffold: z.string(),
  preview: z.string(),
});
export type StructureRequest = z.infer<typeof structureRequestSchema>;
export type Connector = {
  id: string;
  text: string;
  registers: StructureRegister[];
  distinction: string;
};
export type SentenceScaffold = {
  id: string;
  template: string;
  effect: string;
  registers: StructureRegister[];
};
export type CompositionRelationship = {
  id: RelationshipId;
  label: string;
  principle: string;
  question: string;
  connectors: Connector[];
  scaffolds: SentenceScaffold[];
};
/** Heuristic clause/line segmentation, not semantic AI or a grammar parser.
 * Text is sliced verbatim, including whitespace and punctuation. start/end are
 * JavaScript UTF-16 offsets (end exclusive), NOT UTF-8 byte positions, matching
 * String.slice and textarea selection. Joining units recovers every original byte
 * for nonblank input; blank-only input has no thoughts. No source draft is mutated.
 * We split at sentence endings, line breaks, explicit conjunctions with a likely
 * subject, and 'and then'. Bare 'and' in a list stays intact. Quotation/nested-clause
 * interpretation is deliberately left to the writer; these are editable proposals.
 */
export function segmentRawThoughts(raw: string): StructureDraft["units"] {
  if (!raw.trim()) return [];
  const units: StructureDraft["units"] = [];
  const finite =
    "(?:is|are|was|were|has|have|had|can|could|will|would|should|must|does|do|did|costs?|works?|worked)\\b";
  const subject = `(?:(?:i|you|he|she|it|we|they)\\b(?=[ \\t]+\\S)|(?:there|this|that|these|those)\\b(?=[ \\t]+${finite})|(?:the|a|an)[ \\t]+[\\p{L}\\p{M}-]+[ \\t]+${finite})`;
  const boundary = new RegExp(
    `[.!?]["”’')\\]]*[ \\t]+|(?:\\r\\n|[\\r\\n])+|[ \\t]+(?=(?:and[ \\t]+then\\b|(?:and|but|yet|although|because)[ \\t]+${subject}|however\\b))`,
    "giu",
  );
  let start = 0;
  for (const match of raw.matchAll(boundary)) {
    const end = match.index! + match[0].length;
    // Do not mistake common abbreviations or a lone initial for sentence endings.
    if (
      match[0].startsWith(".") &&
      /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|e\.g|i\.e|[A-Z])\.$/u.test(
        raw.slice(0, match.index! + 1),
      )
    )
      continue;
    if (raw.slice(start, end).trim()) {
      units.push({
        id: `thought-${start}`,
        text: raw.slice(start, end),
        start,
        end,
      });
      start = end;
    }
  }
  // Attach a whitespace-only tail to the last thought instead of dropping it.
  if (start < raw.length) {
    if (raw.slice(start).trim() || !units.length)
      units.push({
        id: `thought-${start}`,
        text: raw.slice(start),
        start,
        end: raw.length,
      });
    else {
      const last = units[units.length - 1];
      last.end = raw.length;
      last.text = raw.slice(last.start);
    }
  }
  return units;
}
/** Surface-cue suggestions with reasons, never an automatic relationship selection.
 * A cue is a prompt to check meaning, not evidence for a causal or logical claim.
 */
export function suggestRelationships(
  a: string,
  b: string,
): { id: RelationshipId; reason: string }[] {
  const pair = a + " " + b;
  const out: { id: RelationshipId; reason: string }[] = [];
  if (/\b(but|however|yet|expensive|costly)\b/iu.test(pair))
    out.push({
      id: "contrast",
      reason:
        "Heuristic: an opposition cue or cost concern appears. Could Y qualify a positive assessment in X? Cost alone does not establish opposition; you choose.",
    });
  if (/\b(although|despite|nevertheless|even so)\b/iu.test(pair))
    out.push({
      id: "concede",
      reason:
        "Heuristic: a concession cue appears. Does X grant a point while Y survives the expected objection, rather than merely describe a difference?",
    });
  if (/\b(later|then|before|after|until|subsequently)\b/iu.test(pair))
    out.push({
      id: "sequence",
      reason:
        "Heuristic: a time cue suggests order. It does not prove causation or tell us which event explains the other.",
    });
  if (
    /\b(realiz(?:e|ed|ing)|realis(?:e|ed|ing)|discover(?:ed|y)?|learn(?:ed|t)?|notic(?:e|ed)|found out)\b/iu.test(
      pair,
    ) &&
    /\b(later|until|then|eventually|only)\b/iu.test(pair)
  )
    out.push({
      id: "reveal",
      reason:
        "Heuristic: awareness and delay cues appear together. Could Y disclose something understood only later? This is a possible order of disclosure, not a causal explanation.",
    });
  if (/\b(because|caused|due to)\b/iu.test(pair))
    out.push({
      id: "cause",
      reason:
        "Heuristic: an explanation cue appears. Does Y explain X, or merely offer evidence for believing X? Check the direction and supply support; the cue proves nothing.",
    });
  if (/\b(therefore|consequently|as a result)\b/iu.test(pair))
    out.push({
      id: "result",
      reason:
        "Heuristic: a consequence or inference cue appears. Does Y follow from X? A result needs a supported mechanism or argument, not just temporal order.",
    });
  if (/\b(if|unless|provided that)\b/iu.test(pair))
    out.push({
      id: "condition",
      reason:
        "Heuristic: a condition cue appears. Decide whether X is necessary or sufficient for Y. A conditional is not proof that either claim is true and does not itself establish cause.",
    });
  if (/\b(except|apart from)\b/iu.test(pair))
    out.push({
      id: "exception",
      reason:
        "Heuristic: an exclusion cue appears. Does Y carve out a narrow exception while leaving X intact, rather than opposing the whole claim?",
    });
  return out.length
    ? out
    : [
        {
          id: "clarify",
          reason:
            "Heuristic: no reliable surface cue. Would Y restate or explain the meaning of X without changing it?",
        },
        {
          id: "add",
          reason:
            "Or does Y add an independent, equally weighted point? These are possibilities, not a classification; you choose.",
        },
      ];
}
/** Substitute slots only. Missing values remain visible placeholders. In particular,
 * casing, punctuation, whitespace, and literal replacement-like text ($&, $1) are
 * preserved. Rendering is a preview and never writes back into a source draft.
 */
export function renderScaffold(
  template: string,
  a = "",
  b = "",
  extra = "",
): string {
  const slots: Record<string, string> = { X: a, Y: b, Z: extra };
  return template.replace(
    /\[([XYZ])\]/g,
    (placeholder, slot: string) => slots[slot] || placeholder,
  );
}
