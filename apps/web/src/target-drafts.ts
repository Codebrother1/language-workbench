import {
  documentTarget,
  sectionText,
  targetFor,
  validateTarget,
  type Document,
  type EditTarget,
  type SectionWorkbench,
} from "./domain";

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

export type RhetoricalTargetChoice = {
  kind: "selection" | "sentence" | "quoted_turn" | "section";
  label: string;
  target: EditTarget;
};

export function quotedTurnRange(
  text: string,
  start: number,
  end = start,
): { start: number; end: number } | null {
  const spans: { start: number; end: number }[] = [];
  let open: { start: number; close: string } | null = null;
  for (let i = 0; i < text.length; i++) {
    const mark = text[i];
    if (!open && (mark === '"' || mark === "“"))
      open = { start: i, close: mark === '"' ? '"' : "”" };
    else if (open && (mark === '"' || mark === "”")) {
      if (mark !== open.close) return null;
      spans.push({ start: open.start, end: i + 1 });
      open = null;
    } else if ((open && mark === "“") || (!open && mark === "”")) return null;
  }
  if (open || start < 0 || end < start) return null;
  return spans.find((span) => start >= span.start && end <= span.end) ?? null;
}

export function rhetoricalTargetChoices(
  doc: Document,
  target: EditTarget,
  caret: number,
  hasSelection: boolean,
): RhetoricalTargetChoice[] {
  const section = doc.sections.find((item) => item.id === target.sectionId);
  if (!section) return [];
  const text = sectionText(section);
  const choices: RhetoricalTargetChoice[] = [];
  if (hasSelection && (target.scope === "word" || target.scope === "selection"))
    choices.push({
      kind: "selection",
      label: "Selection",
      target: { ...target, unit: "selection" },
    });
  const sentence = hasSelection
    ? [
        ...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(
          text,
        ),
      ].find(
        (part) =>
          caret >= part.index && caret < part.index + part.segment.length,
      )
    : null;
  const start = sentence
    ? sentence.index +
      (sentence.segment.length - sentence.segment.trimStart().length)
    : target.start;
  const end = sentence
    ? sentence.index + sentence.segment.trimEnd().length
    : target.end;
  if (start < end && (!hasSelection || sentence))
    choices.push({
      kind: "sentence",
      label: "Current sentence",
      target: {
        ...targetFor(doc, section.id, "selection", start, end),
        unit: "sentence",
      },
    });
  const quote = quotedTurnRange(
    text,
    hasSelection ? target.start : caret,
    hasSelection ? target.end : caret,
  );
  if (quote)
    choices.push({
      kind: "quoted_turn",
      label: "Quoted turn",
      target: {
        ...targetFor(doc, section.id, "selection", quote.start, quote.end),
        unit: "quoted_turn",
      },
    });
  choices.push({
    kind: "section",
    label: "Section",
    target: targetFor(doc, section.id),
  });
  return choices;
}

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
      if (
        saved.scope === "selection" &&
        saved.unit === "sentence" &&
        !saved.focusOrigin
      ) {
        const workbench = doc.sections.find(
          (section) => section.id === saved.sectionId,
        )?.workbench;
        const draft = workbench?.targetDrafts?.[targetDraftKey(saved)];
        const deliberateDraft =
          draft?.target.sectionId === saved.sectionId &&
          !!(draft.instruction.trim() || draft.answer.trim());
        const deliberateRun = workbench?.runs.some(
          (run) =>
            run.target.sectionId === saved.sectionId &&
            run.target.sectionSnapshot === saved.sectionSnapshot &&
            targetDraftKey(run.target) === targetDraftKey(saved),
        );
        if (!deliberateDraft && !deliberateRun)
          return targetFor(doc, saved.sectionId);
      }
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
    a.unit === b.unit &&
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
