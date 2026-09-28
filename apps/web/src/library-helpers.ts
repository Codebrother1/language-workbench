import {
  libraryItemSchema,
  matchesLibraryScope,
  defaultSettings,
  uid,
  type Document,
  type SavedGuidance,
  type StyleDNA,
  type WritingAction,
  type LibraryItem,
  type PersonalLibrary,
  type EditTarget,
  type SectionWorkbench,
  type StructureRequest,
} from "./domain";
import { makeRun } from "./workspace-helpers";

export function guidanceIdentity(item: SavedGuidance): string {
  return item.itemId
    ? `library:${item.itemId}`
    : `${item.source}:${item.key ?? ""}`;
}
export function guidanceContext(
  doc: Document,
  target: EditTarget | null,
  action: WritingAction,
) {
  const section = doc.sections.find((item) => item.id === target?.sectionId);
  return section && target
    ? {
        sectionId: section.id,
        context: JSON.stringify([
          section.kind,
          target.scope,
          action,
          doc.brief.contentType,
        ]),
      }
    : null;
}
export function isGuidanceDismissed(
  doc: Document,
  item: SavedGuidance,
  target: EditTarget | null,
  action: WritingAction,
): boolean {
  const scope = guidanceContext(doc, target, action);
  return (
    !!scope &&
    doc.guidanceDismissals.some(
      (dismissal) =>
        dismissal.sectionId === scope.sectionId &&
        dismissal.context === scope.context &&
        dismissal.identity === guidanceIdentity(item),
    )
  );
}

export function contextualGuidance(input: {
  doc: Document;
  target: EditTarget | null;
  action: WritingAction;
  styleDNA: StyleDNA;
  library: PersonalLibrary;
}): SavedGuidance[] {
  const section = input.doc.sections.find(
    (item) => item.id === input.target?.sectionId,
  );
  if (!section || !input.target) return [];
  const context = {
    sectionKind: section.kind,
    contentType: input.doc.brief.contentType,
    audience: input.doc.brief.audience,
    register: input.styleDNA.register,
  };
  const task = input.action.toLowerCase();
  const categories = [
    ...((["rhythm", "coach"].includes(task) &&
      ["selection", "word"].includes(input.target.scope)) ||
    section.kind === "Hook"
      ? ["rhythm", "sentenceLengths"]
      : []),
    ...(task === "humor" || section.kind === "Punchline"
      ? ["humor", "explanationDepth"]
      : []),
    ...(["Closer", "Conclusion"].includes(section.kind)
      ? ["endingStyles", "callbackUsage"]
      : []),
    ...(["Segue", "Transition"].includes(section.kind) ? ["transitions"] : []),
    ...(input.target.scope === "word" || task === "words"
      ? ["profanity", "register"]
      : []),
    ...(task === "technical" ? ["technicality"] : []),
  ] as (keyof StyleDNA)[];
  const metadataMatches = (item: LibraryItem) =>
    [...item.tags, ...item.effects, item.ruleKey].some((value) =>
      [
        task,
        section.kind.toLowerCase(),
        ...categories.map((key) => key.toLowerCase()),
      ].includes(value.toLowerCase()),
    );
  const candidates: { item: SavedGuidance; score: number }[] = [];
  for (const item of input.library.items) {
    if (
      !item.content.trim() ||
      item.content.length > 3000 ||
      !matchesLibraryScope(item, context)
    )
      continue;
    const scoped = item.sectionKinds.length > 0;
    const tagged = metadataMatches(item);
    const contentScoped = item.contentTypes.length > 0;
    const transition = ["Segue", "Transition"].includes(section.kind);
    const connector = item.kind === "connector" && transition;
    if (item.kind === "connector" && !connector) continue;
    if (!connector && !scoped && !tagged) continue;
    const score =
      item.kind === "style_rule" && scoped
        ? 100
        : connector
          ? 90
          : scoped
            ? 85
            : item.kind === "style_rule" && (tagged || contentScoped)
              ? 70
              : tagged
                ? 55
                : 40;
    candidates.push({
      score,
      item: {
        source: connector
          ? "connector"
          : item.kind === "style_rule" && scoped
            ? "section_style"
            : "library",
        itemId: item.id,
        kind: item.kind,
        preference: item.preference,
        title: item.title,
        text: item.content,
      },
    });
  }
  const defaults = defaultSettings().styleDNA;
  for (const key of new Set(categories)) {
    const value = input.styleDNA[key];
    if (typeof value !== "string" || !value.trim() || value === defaults[key])
      continue;
    candidates.push({
      score: 80,
      item: {
        source: "style_dna",
        key,
        title: key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (letter) => letter.toUpperCase()),
        text: value,
      },
    });
  }
  const seen = new Set<string>();
  return candidates
    .sort(
      (a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title),
    )
    .map(({ item }) => item)
    .filter((item) => {
      const normalized = item.text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 3);
}

export type SaveLibraryItemInput = Pick<LibraryItem, "kind" | "content"> &
  Partial<
    Pick<
      LibraryItem,
      | "title"
      | "sectionKinds"
      | "tags"
      | "effects"
      | "register"
      | "notes"
      | "contentTypes"
      | "audiences"
      | "preference"
      | "myLanguage"
      | "ruleKey"
      | "provenance"
    >
  >;
export type LibraryItemPatch = Partial<
  Omit<LibraryItem, "id" | "createdAt" | "updatedAt">
>;

/** Only caller-supplied text/metadata: saving never extracts or invents a rule. */
export function createLibraryItem(input: SaveLibraryItemInput): LibraryItem {
  const now = new Date().toISOString();
  return libraryItemSchema.parse({
    ...input,
    id: uid(),
    title: input.title ?? input.content.slice(0, 80),
    createdAt: now,
    updatedAt: now,
  });
}

/** Replay explicit local changes over a new server revision (not a stale whole snapshot).
 * Untouched and imported items survive; explicit deletes remain deletes. */
export function libraryDelta(before: PersonalLibrary, after: PersonalLibrary) {
  const previous = new Map(before.items.map((item) => [item.id, item]));
  const next = new Map(after.items.map((item) => [item.id, item]));
  const removed = new Set(
    before.items.filter((item) => !next.has(item.id)).map((item) => item.id),
  );
  const changed = after.items.filter(
    (item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item),
  );
  return (base: PersonalLibrary): PersonalLibrary => {
    const items = new Map(
      base.items
        .filter((item) => !removed.has(item.id))
        .map((item) => [item.id, item]),
    );
    changed.forEach((item) => items.set(item.id, item));
    return { ...base, items: [...items.values()] };
  };
}

/** Human previews enter the same run/history pipeline; no canonical document mutation. */
export function makeHumanRun(input: {
  target: EditTarget;
  workbench: SectionWorkbench;
  text: string;
  title: string;
  instruction: string;
  provider: "human-library" | "human-structure";
  structure?: StructureRequest;
}) {
  return makeRun(
    {
      target: input.target,
      action: "coach",
      instruction: input.instruction,
      answer: input.text,
      controls: { ...input.workbench.controls },
      model: null,
      question: "",
      ...(input.structure ? { structure: input.structure } : {}),
    },
    {
      provider: input.provider,
      diagnosis:
        "User-selected preview. Apply explicitly to change the target.",
      mechanism: "Verbatim human preview",
      question: "",
      missingIngredients: [],
      proposals: [
        {
          id: uid(),
          label: input.title,
          text: input.text,
          explanation:
            "Uses the selected saved text or user-filled scaffold exactly; no new facts were generated.",
        },
      ],
      findings: [],
      lexical: [],
    },
  );
}
