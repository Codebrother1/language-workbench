import {
  emptyWorkbench,
  documentText,
  sectionText,
  structuralMechanisms,
  uid,
  type Document,
  type PieceMemory,
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

import { patchTargetDraft, resolveHistoricalTarget } from "./target-drafts";

export function labActionLabel(action: WritingAction, target: string): string {
  switch (action) {
    case "humor":
      return "Try humor";
    case "register":
      return "Explore register";
    case "rhythm":
      return "Explore rhythm";
    case "figurative":
      return "Explore figurative language";
    default:
      return `Diagnose this ${target}`;
  }
}

export function duplicateDocumentCue(
  doc: Document,
  documents: Document[],
): string {
  const matches = documents.filter(
    (other) =>
      other.id !== doc.id &&
      other.title.trim().toLowerCase() === doc.title.trim().toLowerCase(),
  );
  if (!matches.length) return "";
  const excerpt = (item: Document) =>
    documentText(item).replace(/\s+/g, " ").trim().slice(0, 42);
  const opening = excerpt(doc);
  if (opening && matches.every((item) => excerpt(item) !== opening))
    return `“${opening}”`;
  const edited = new Date(doc.updatedAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return matches.every(
    (item) =>
      new Date(item.updatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) !== edited,
  )
    ? `modified ${edited}`
    : `modified ${edited} · ${doc.id.slice(-6)}`;
}

export function hasPieceMemoryContent(memory: PieceMemory): boolean {
  return Boolean(
    memory.purpose.trim() ||
    memory.reader.trim() ||
    memory.currentQuestion.trim() ||
    memory.nextMove.trim() ||
    memory.lastSessionNote.trim() ||
    memory.unresolved.some((item) => item.trim()) ||
    memory.decisions.some((item) => item.text.trim()),
  );
}

export function documentBackup(
  documents: Document[],
  archivedIds: string[],
  exportedAt = new Date().toISOString(),
) {
  const archived = new Set(archivedIds);
  return {
    format: "language-workbench-document-backup" as const,
    version: 1 as const,
    exportedAt,
    documents: documents.map((doc) => structuredClone(doc)),
    archivedIds: documents
      .filter((doc) => archived.has(doc.id))
      .map((doc) => doc.id),
  };
}

export function chooseActiveDocument(
  documents: Document[],
  selectedId: string | null,
): Document | null {
  return (
    documents.find((document) => document.id === selectedId) ??
    documents[0] ??
    null
  );
}

export function textDifference(
  before: string,
  after: string,
): {
  prefix: string;
  removed: string;
  added: string;
  suffix: string;
} {
  const a = Array.from(before),
    b = Array.from(after);
  let start = 0,
    end = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  while (
    end < Math.min(a.length - start, b.length - start) &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  return {
    prefix: a.slice(0, start).join(""),
    removed: a.slice(start, a.length - end).join(""),
    added: b.slice(start, b.length - end).join(""),
    suffix: end ? a.slice(-end).join("") : "",
  };
}

export type DiffPart = { text: string; changed: boolean };
export function alignedTextDifference(
  before: string,
  after: string,
): { before: DiffPart[]; after: DiffPart[] } {
  const { prefix, removed, added, suffix } = textDifference(before, after);
  const oldTokens = removed.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
  const newTokens = added.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
  const previous: DiffPart[] = [],
    current: DiffPart[] = [];
  const push = (parts: DiffPart[], text: string, changed: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  push(previous, prefix, false);
  push(current, prefix, false);
  if (
    oldTokens.length * newTokens.length > 200_000 ||
    Math.max(oldTokens.length, newTokens.length) > 750 ||
    Math.max(oldTokens.length, newTokens.length) < 8
  ) {
    push(previous, removed, true);
    push(current, added, true);
  } else {
    const scores = oldTokens.map(() => new Uint16Array(newTokens.length + 1));
    scores.push(new Uint16Array(newTokens.length + 1));
    for (let i = oldTokens.length - 1; i >= 0; i--)
      for (let j = newTokens.length - 1; j >= 0; j--)
        scores[i][j] =
          oldTokens[i] === newTokens[j]
            ? scores[i + 1][j + 1] +
              (/^[\p{L}\p{N}]+$/u.test(oldTokens[i]) ? 3 : 1)
            : Math.max(scores[i + 1][j], scores[i][j + 1]);
    let i = 0,
      j = 0;
    while (i < oldTokens.length || j < newTokens.length) {
      if (
        i < oldTokens.length &&
        j < newTokens.length &&
        oldTokens[i] === newTokens[j] &&
        scores[i][j] > scores[i + 1][j] &&
        scores[i][j] > scores[i][j + 1]
      ) {
        push(previous, oldTokens[i++], false);
        push(current, newTokens[j++], false);
      } else if (
        i < oldTokens.length &&
        (j === newTokens.length || scores[i + 1][j] >= scores[i][j + 1])
      )
        push(previous, oldTokens[i++], true);
      else push(current, newTokens[j++], true);
    }
  }
  push(previous, suffix, false);
  push(current, suffix, false);
  return { before: previous, after: current };
}

export function currentTakeIds(section: WritingSection): string[] {
  const prose = sectionText(section);
  return section.variants
    .filter((take) => take.text === prose)
    .map((take) => take.id);
}

export function humanTargetLabel(target: EditTarget): string {
  if (target.scope === "document") return "Whole piece";
  if (target.scope === "section") return "Whole section";
  if (target.unit === "quoted_turn") return "Quoted turn";
  if (target.unit === "sentence") return "Current sentence";
  return target.scope === "word" ? "Selected word" : "Selected passage";
}

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
  if (!section) return "Section no longer available";
  if (run.target.scope === "selection" || run.target.scope === "word") {
    const resolution = resolveHistoricalTarget(doc, run.target);
    return resolution.status !== "exact"
      ? "Target changed"
      : sectionText(section) === run.target.sectionSnapshot
        ? "Current draft"
        : "Current target";
  }
  return sectionText(section) === run.target.sectionSnapshot
    ? "Current draft"
    : "Earlier draft";
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

export function isDeliveryTarget(target: EditTarget | null): boolean {
  return (
    !!target?.sectionId &&
    (target.scope === "word" || target.scope === "selection") &&
    !!target.text.trim() &&
    target.text.length <= 400 &&
    target.text.trim().split(/\s+/u).length <= 60 &&
    (target.text.match(/\n/g) ?? []).length <= 3
  );
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
  stage?: "diagnose" | "propose";
  structure?: StructureRequest;
  lens?: LensOptions;
  target: EditTarget;
  action: WritingAction;
  instruction: string;
  answer: string;
  controls: SectionWorkbench["controls"];
  model: ModelRef | null;
  chainModel?: ModelRef;
  guidance?: WorkbenchRun["guidance"];
  question: string;
};
export function writerResultReason(reason: string): string {
  return reason.replace(
    /A protected (quote|code span)(.*?) was changed/gi,
    (_match, kind: string, excerpt: string) =>
      `The generated option changed a protected ${kind}${excerpt}`,
  );
}

export function resultOutcome(
  run: WorkbenchRun,
): { title: string; reasons: string[] } | null {
  if (run.stage !== "propose" || run.response.proposals.length) return null;
  const reasons = [
    ...(run.response.qualityNotices ?? []),
    ...run.response.missingIngredients,
  ]
    .map((reason) => reason.trim())
    .filter(Boolean);
  if (!reasons.length) return { title: "No result returned", reasons: [] };
  const detail = reasons.join(" ");
  return {
    title:
      /\b(unsupported|unavailable|cannot|not configured|not supported)\b/i.test(
        detail,
      )
        ? "Unavailable for this provider"
        : /\b(no safe|protected|violat|reject|blocked)\b/i.test(detail)
          ? "No safe result"
          : "No proposal returned",
    reasons,
  };
}

export function makeRun(
  capture: RunCapture,
  response: AIResponse,
): WorkbenchRun {
  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    target: capture.target,
    ...(capture.stage ? { stage: capture.stage } : {}),
    action: capture.action,
    instruction: capture.instruction,
    answer: capture.answer,
    conversation: [],
    guidance: capture.guidance ?? [],
    controls: { ...capture.controls },
    model: response.model ?? capture.model,
    ...(capture.chainModel ? { chainModel: capture.chainModel } : {}),
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
  const next = updateWorkbench(doc, sectionId, (wb) => {
    const previous = wb.runs.find((item) => item.id === wb.activeRunId);
    const sameQuestion =
      run.stage === "propose" &&
      !!run.response.question.trim() &&
      run.response.question.trim() === previous?.response.question.trim();
    return {
      ...wb,
      runs: [...wb.runs, run],
      activeRunId: run.id,
      questionAnswers: {
        ...wb.questionAnswers,
        [run.id]: sameQuestion
          ? (wb.questionAnswers[previous!.id] ?? run.answer)
          : "",
      },
      proposalStates: saveVariants
        ? {
            ...wb.proposalStates,
            ...Object.fromEntries(
              run.response.proposals.map((p) => [p.id, "saved"]),
            ),
          }
        : wb.proposalStates,
    };
  });
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
      ...(wb.runChain
        ? {
            runChain: {
              ...wb.runChain,
              target: { ...wb.runChain.target, documentId },
            },
          }
        : {}),
    }
  );
}
