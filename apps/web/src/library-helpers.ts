import {
  libraryItemSchema,
  uid,
  type LibraryItem,
  type PersonalLibrary,
  type EditTarget,
  type SectionWorkbench,
  type StructureRequest,
} from "./domain";
import { makeRun } from "./workspace-helpers";

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
