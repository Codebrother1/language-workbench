import {
  sectionText,
  uid,
  type Document,
  type EditTarget,
  type WritingSection,
} from "./index";

/** Insert before an existing instance, or append explicitly with null. */
export function insertSectionAt(
  doc: Document,
  section: WritingSection,
  beforeSectionId: string | null,
): Document {
  if (doc.sections.some((item) => item.id === section.id))
    throw new Error("Section ID already exists");
  const index =
    beforeSectionId === null
      ? doc.sections.length
      : sectionIndex(doc, beforeSectionId);
  return {
    ...doc,
    sections: [
      ...doc.sections.slice(0, index),
      structuredClone(section),
      ...doc.sections.slice(index),
    ],
  };
}

function sectionIndex(doc: Document, sectionId: string): number {
  const index = doc.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) throw new Error("Section not found");
  return index;
}

/** Reserve even historical/dangling references so fresh IDs cannot revive them. */
function freshIdFactory(doc: Document): () => string {
  const reserved = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") reserved.add(value);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        reserved.add(key);
        visit(child);
      }
    }
  };
  visit(doc);
  return () => {
    let id = uid();
    while (reserved.has(id)) id = uid();
    reserved.add(id);
    return id;
  };
}

/**
 * Copy an instance, including its local drafts and provenance, immediately below
 * it. Only targets owned by this source are rebound; ranges/snapshots are never
 * repaired, so stale or foreign historical targets retain their safety guards.
 * Document revision/timestamps remain the persistence layer's responsibility.
 */
export function duplicateSection(doc: Document, sectionId: string): Document {
  const index = sectionIndex(doc, sectionId);
  const copy = structuredClone(doc.sections[index]);
  const freshId = freshIdFactory(doc);
  copy.id = freshId();
  copy.label += " — copy";

  const ownsTarget = (target: EditTarget): boolean =>
    target.scope !== "document" &&
    target.documentId === doc.id &&
    target.sectionId === sectionId;
  const remapTarget = (target: EditTarget): EditTarget =>
    ownsTarget(target)
      ? {
          ...target,
          sectionId: copy.id,
          documentId: doc.id,
          documentRevision: doc.revision,
        }
      : target;

  const runIds = new Map<string, string>();
  const proposalIds = new Map<string, string>();
  const mappedId = (map: Map<string, string>, id: string): string => {
    let next = map.get(id);
    if (next === undefined) {
      next = freshId();
      map.set(id, next);
    }
    return next;
  };

  // One proposal map is shared by response IDs, state keys and history IDs.
  // Likewise, dangling legacy run references get their own consistent identity.
  for (const variant of copy.variants ?? []) {
    variant.id = freshId();
    variant.target = remapTarget(variant.target);
    if (variant.runId !== undefined)
      variant.runId = mappedId(runIds, variant.runId);
  }
  const wb = copy.workbench;
  if (wb) {
    for (const run of wb.runs ?? []) {
      run.id = mappedId(runIds, run.id);
      run.target = remapTarget(run.target);
      for (const proposal of run.response.proposals ?? [])
        proposal.id = mappedId(proposalIds, proposal.id);
      for (const finding of run.response.findings ?? []) {
        if (finding.sectionId === sectionId) finding.sectionId = copy.id;
      }
    }
    if (wb.activeRunId != null)
      wb.activeRunId = mappedId(runIds, wb.activeRunId);
    if (wb.proposalStates)
      wb.proposalStates = Object.fromEntries(
        Object.entries(wb.proposalStates).map(([id, state]) => [
          mappedId(proposalIds, id),
          state,
        ]),
      );
  }

  const history = (doc.history ?? [])
    .filter((entry) => ownsTarget(entry.target))
    .map((entry) => {
      const cloned = structuredClone(entry);
      cloned.id = mappedId(proposalIds, entry.id);
      cloned.target = remapTarget(cloned.target);
      if (cloned.runId !== undefined)
        cloned.runId = mappedId(runIds, cloned.runId);
      return cloned;
    });
  return {
    ...doc,
    sections: [
      ...doc.sections.slice(0, index + 1),
      copy,
      ...doc.sections.slice(index + 1),
    ],
    history: [...(doc.history ?? []), ...history],
  };
}

/** Keep history for undo/provenance; deleting the last instance leaves a caret. */
export function removeSection(
  doc: Document,
  sectionId: string,
  emptySection: WritingSection,
): Document {
  const index = sectionIndex(doc, sectionId);
  if (doc.sections.length === 1) {
    if (emptySection.id === sectionId)
      throw new Error("Replacement section needs a fresh ID");
    if (emptySection.kind !== "Freeform" || sectionText(emptySection) !== "")
      throw new Error("Replacement section must be an empty Freeform section");
    return { ...doc, sections: [structuredClone(emptySection)] };
  }
  return {
    ...doc,
    sections: [
      ...doc.sections.slice(0, index),
      ...doc.sections.slice(index + 1),
    ],
  };
}
