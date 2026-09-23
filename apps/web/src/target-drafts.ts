import {
  documentTarget,
  sectionText,
  targetFor,
  validateTarget,
  type Document,
  type EditTarget,
  type SectionWorkbench,
} from "./domain";

export type TargetDraft = { instruction: string; answer: string };
export const isLocalDraftTarget = (
  target: EditTarget | null,
): target is EditTarget =>
  !!target?.sectionId &&
  (target.scope === "word" || target.scope === "selection");

/** Revision and the surrounding section are deliberately not draft identity. */
export function targetDraftKey(target: EditTarget): string {
  return JSON.stringify([target.scope, target.start, target.end, target.text]);
}
export function getTargetDraft(
  wb: SectionWorkbench,
  target: EditTarget | null,
): TargetDraft {
  if (!isLocalDraftTarget(target))
    return { instruction: wb.instruction, answer: wb.answer };
  const draft = wb.targetDrafts?.[targetDraftKey(target)];
  return draft &&
    draft.target.documentId === target.documentId &&
    draft.target.sectionId === target.sectionId
    ? { instruction: draft.instruction, answer: draft.answer }
    : { instruction: "", answer: "" };
}
export function patchTargetDraft(
  wb: SectionWorkbench,
  target: EditTarget | null,
  patch: Partial<TargetDraft>,
): SectionWorkbench {
  if (!isLocalDraftTarget(target)) return { ...wb, ...patch };
  return {
    ...wb,
    targetDrafts: {
      ...wb.targetDrafts,
      [targetDraftKey(target)]: {
        ...getTargetDraft(wb, target),
        ...patch,
        target: { ...target },
      },
    },
  };
}

/** Restore exact snapshots only. Never search for or guess a stale local range. */
export function restoreFocusTarget(
  doc: Document,
  saved: EditTarget | null | undefined = doc.focusTarget,
): EditTarget | null {
  if (saved?.documentId === doc.id) {
    if (saved.scope === "document") return documentTarget(doc);
    if (saved.sectionId && doc.sections.some((s) => s.id === saved.sectionId)) {
      try {
        validateTarget(doc, saved);
        return { ...saved, documentRevision: doc.revision };
      } catch {
        return targetFor(doc, saved.sectionId);
      }
    }
  }
  return doc.sections[0] ? targetFor(doc, doc.sections[0].id) : null;
}

/** Merge at the persistence boundary, not inside editor selection callbacks. */
export function withFocusTarget(
  doc: Document,
  target: EditTarget | null,
): Document {
  return {
    ...doc,
    focusTarget: target?.documentId === doc.id ? { ...target } : null,
  };
}
export function sameFocusTarget(
  a: EditTarget | null,
  b: EditTarget | null,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.documentId === b.documentId &&
    a.sectionId === b.sectionId &&
    a.sectionSnapshot === b.sectionSnapshot &&
    targetDraftKey(a) === targetDraftKey(b)
  );
}

export function canCoachTarget(
  doc: Document,
  target: EditTarget | null,
  instruction: string,
): boolean {
  if (!target) return false;
  if (target.text.trim()) return true;
  if (target.scope !== "section" || !target.sectionId) return false;
  const index = doc.sections.findIndex((s) => s.id === target.sectionId);
  if (index < 0) return false;
  const brief = doc.brief;
  return !!(
    instruction.trim() ||
    doc.sections[index].notes.trim() ||
    [doc.sections[index - 1], doc.sections[index + 1]].some(
      (s) => s && sectionText(s).trim(),
    ) ||
    brief.destination.trim() ||
    brief.audience.trim() ||
    brief.desiredLength.trim() ||
    brief.customNotes.trim() ||
    brief.objectives.some((s) => s.trim()) ||
    brief.desiredReactions.some((s) => s.trim()) ||
    brief.contentType !== "freeform" ||
    doc.sources.some((s) => s.text.trim())
  );
}
