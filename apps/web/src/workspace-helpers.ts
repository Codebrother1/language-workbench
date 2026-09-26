import {
  emptyWorkbench,
  documentText,
  sectionText,
  structuralMechanisms,
  uid,
  type Document,
  type WritingSection,
  type EditTarget,
  type SectionWorkbench,
  type WorkbenchRun,
  type AIResponse,
  type ModelRef,
  type WritingAction,
  type LensOptions,
  type StructureRequest,
} from "./domain";

import { patchTargetDraft } from "./target-drafts";

export function customSectionLabel(section: WritingSection): string | null {
  const label = section.label.trim();
  return label && label !== section.kind ? label : null;
}
export function sectionReference(doc: Document, id: string): string | null {
  const index = doc.sections.findIndex((section) => section.id === id);
  if (index < 0) return null;
  const section = doc.sections[index];
  return (
    customSectionLabel(section) ??
    (section.kind === "Freeform"
      ? `Section ${index + 1}`
      : `${section.kind} · Section ${index + 1}`)
  );
}
export function sectionMentions(
  doc: Document,
  text: string,
): { text: string; sectionId?: string }[] {
  const pattern =
    /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|\bSections?\s+\d+(?:\s*(?:,|and|&|\/)\s*\d+)*/gi;
  const parts: { text: string; sectionId?: string }[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > offset)
      parts.push({ text: text.slice(offset, match.index) });
    const ids = /^sections?\b/i.test(match[0])
      ? (match[0].match(/\d+/g) ?? []).map(
          (number) => doc.sections[Number(number) - 1]?.id,
        )
      : [
          doc.sections.find(
            (section) => section.id.toLowerCase() === match[0].toLowerCase(),
          )?.id,
        ];
    if (ids.length && ids.every((id) => id && sectionReference(doc, id)))
      ids.forEach((id, index) => {
        if (index) parts.push({ text: " and " });
        parts.push({ text: sectionReference(doc, id!)!, sectionId: id });
      });
    else parts.push({ text: match[0] });
    offset = match.index + match[0].length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts.length ? parts : [{ text }];
}

export function runDraftState(doc: Document, run: WorkbenchRun): string {
  if (run.target.scope === "document")
    return run.target.text === documentText(doc)
      ? "Current draft"
      : "Earlier draft";
  const section = doc.sections.find((item) => item.id === run.target.sectionId);
  return section && sectionText(section) === run.target.sectionSnapshot
    ? "Current section"
    : "Earlier section";
}

export function getWorkbench(
  doc: Document,
  sectionId: string | null,
): SectionWorkbench {
  const stored =
    sectionId === null
      ? doc.workbench
      : doc.sections.find((s) => s.id === sectionId)?.workbench;
  return (
    stored ?? {
      ...emptyWorkbench(),
      controls: { mechanism: structuralMechanisms[0].name },
    }
  );
}

/** Always patch the latest document, never a request-time snapshot. */
export function updateWorkbench(
  doc: Document,
  sectionId: string | null,
  fn: (workbench: SectionWorkbench) => SectionWorkbench,
): Document {
  if (sectionId === null)
    return { ...doc, workbench: fn(getWorkbench(doc, null)) };
  return {
    ...doc,
    sections: doc.sections.map((s) =>
      s.id === sectionId
        ? { ...s, workbench: fn(getWorkbench(doc, sectionId)) }
        : s,
    ),
  };
}

export function isLensTarget(
  target: EditTarget | null,
  hasSelection: boolean,
): boolean {
  return (
    !!target &&
    (target.scope === "word" ||
      (target.scope === "selection" &&
        hasSelection &&
        target.text.trim().length > 0 &&
        !/[.!?]\s*$/u.test(target.text) &&
        target.text.trim().split(/\s+/u).length <= 8))
  );
}

export function inspectRun(wb: SectionWorkbench, id: string): SectionWorkbench {
  const run = wb.runs.find((r) => r.id === id);
  return run
    ? {
        ...patchTargetDraft(wb, run.target, {
          instruction: run.instruction,
          answer: run.answer,
        }),
        activeRunId: id,
        action: run.action,
        controls: { ...run.controls },
        lens: run.lens ?? wb.lens,
        ...(run.structure
          ? { structure: structuredClone(run.structure.draft) }
          : {}),
      }
    : wb;
}

export type RunCapture = {
  structure?: StructureRequest;
  lens?: LensOptions;
  target: EditTarget;
  action: WritingAction;
  instruction: string;
  answer: string;
  controls: SectionWorkbench["controls"];
  model: ModelRef | null;
  question: string;
};
export function makeRun(
  capture: RunCapture,
  response: AIResponse,
): WorkbenchRun {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    target: capture.target,
    action: capture.action,
    instruction: capture.instruction,
    answer: capture.answer,
    controls: { ...capture.controls },
    model: response.model ?? capture.model,
    ...(capture.lens ? { lens: capture.lens } : {}),
    ...(capture.structure
      ? { structure: structuredClone(capture.structure) }
      : {}),
    response: {
      ...response,
      proposals: response.proposals.map((p) => ({ ...p, id: uid() })),
    },
  };
}

/** Diagnosis and proposals share one durable run store. Canonical text is never changed. */
export function appendRun(
  doc: Document,
  run: WorkbenchRun,
  question = "",
  saveVariants = false,
): Document {
  if (doc.id !== run.target.documentId)
    throw new Error(
      "The originating document is no longer open. Run was not restored.",
    );
  const sectionId =
    run.target.scope === "document" ? null : run.target.sectionId;
  if (sectionId !== null && !doc.sections.some((s) => s.id === sectionId))
    throw new Error(
      "The originating section was removed. Run was not restored.",
    );
  const next = updateWorkbench(doc, sectionId, (wb) => ({
    ...wb,
    runs: [...wb.runs, run],
    activeRunId: run.id,
    proposalStates: saveVariants
      ? {
          ...wb.proposalStates,
          ...Object.fromEntries(
            run.response.proposals.map((p) => [p.id, "saved"]),
          ),
        }
      : wb.proposalStates,
  }));
  return {
    ...next,
    history: [
      ...next.history,
      ...run.response.proposals.map((p) => ({
        id: p.id,
        createdAt: run.createdAt,
        target: run.target,
        instruction: run.instruction,
        coachQuestion: run.response.question || question,
        userAnswer: run.answer,
        proposal: p.text,
        state: saveVariants ? ("saved" as const) : ("proposed" as const),
        provider: run.response.provider,
        ...(run.model ? { model: run.model } : {}),
        runId: run.id,
      })),
    ],
    sections: saveVariants
      ? next.sections.map((s) =>
          s.id === sectionId
            ? {
                ...s,
                variants: [
                  ...s.variants,
                  ...run.response.proposals.map((p) => ({
                    id: uid(),
                    label: p.label,
                    text: p.text,
                    target: run.target,
                    createdAt: run.createdAt,
                    origin: "ai" as const,
                    ...(run.model ? { model: run.model } : {}),
                    runId: run.id,
                  })),
                ],
              }
            : s,
        )
      : next.sections,
  };
}

export function editRunProposal(
  doc: Document,
  sectionId: string | null,
  runId: string,
  proposalId: string,
  text: string,
): Document {
  const next = updateWorkbench(doc, sectionId, (wb) => ({
    ...wb,
    runs: wb.runs.map((run) =>
      run.id === runId
        ? {
            ...run,
            response: {
              ...run.response,
              proposals: run.response.proposals.map((p) =>
                p.id === proposalId ? { ...p, text } : p,
              ),
            },
          }
        : run,
    ),
  }));
  return {
    ...next,
    history: next.history.map((h) =>
      h.id === proposalId ? { ...h, proposal: text } : h,
    ),
  };
}

/** Fork provenance remains local to the new document, including diagnosis-only runs. */
export function forkWorkbench(
  wb: SectionWorkbench | undefined,
  documentId: string,
): SectionWorkbench | undefined {
  return (
    wb && {
      ...wb,
      ...(wb.targetDrafts
        ? {
            targetDrafts: Object.fromEntries(
              Object.entries(wb.targetDrafts).map(([key, draft]) => [
                key,
                { ...draft, target: { ...draft.target, documentId } },
              ]),
            ),
          }
        : {}),
      runs: wb.runs.map((run) => ({
        ...run,
        target: { ...run.target, documentId },
      })),
    }
  );
}
