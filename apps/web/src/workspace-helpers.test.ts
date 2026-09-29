import { describe, it, expect } from "vitest";
import {
  newDocument,
  newSection,
  targetFor,
  documentTarget,
  documentSchema,
  sectionText,
  type AIResponse,
} from "./domain";
import {
  getWorkbench,
  updateWorkbench,
  makeRun,
  appendRun,
  editRunProposal,
  inspectRun,
  forkWorkbench,
  isLensTarget,
  isDeliveryTarget,
  sectionReference,
  nextMoveSectionLabel,
  sectionMentions,
  humanTargetLabel,
  currentTakeIds,
  chooseActiveDocument,
  documentBackup,
  hasPieceMemoryContent,
  duplicateDocumentCue,
  textDifference,
  alignedTextDifference,
  runDraftState,
  resultOutcome,
  writerResultReason,
  labActionLabel,
  contextualBrief,
  type RunCapture,
} from "./workspace-helpers";

function fixture() {
  const doc = newDocument("Two sections", "First section stays untouched.");
  doc.sections.push(newSection("Hook", "Second section stays untouched."));
  const [a, b] = doc.sections;
  const capture: RunCapture = {
    target: targetFor(doc, a.id),
    action: "coach",
    instruction: "Be specific",
    answer: "A concrete image",
    controls: { depth: 2 },
    model: { providerId: "mock", modelId: "one" },
    question: "Which image?",
  };
  const response: AIResponse = {
    provider: "mock",
    diagnosis: "Needs an image.",
    mechanism: "",
    question: "Which image?",
    missingIngredients: [],
    proposals: [],
    findings: [],
    lexical: [],
  };
  return { doc, a, b, capture, response };
}

describe("document title disambiguation", () => {
  it("shows a short opening for duplicate titles and nothing for unique titles", () => {
    const a = newDocument("Repeated", "This is the first opening.");
    const b = newDocument("Repeated", "This is the second opening.");
    const other = newDocument("Unique", "Elsewhere.");
    expect(duplicateDocumentCue(a, [a, b, other])).toContain("first opening");
    expect(duplicateDocumentCue(b, [a, b, other])).toContain("second opening");
    expect(duplicateDocumentCue(other, [a, b, other])).toBe("");
    b.sections[0].content = a.sections[0].content;
    expect(duplicateDocumentCue(a, [a, b])).toContain(a.id.slice(-6));
  });
});

describe("Piece memory presence", () => {
  it("does not mistake an empty memory's revision for authored intention", () => {
    const memory = newDocument().pieceMemory;
    memory.reviewedDraftRevision = 0;
    expect(hasPieceMemoryContent(memory)).toBe(false);
    memory.purpose = "A specific purpose.";
    expect(hasPieceMemoryContent(memory)).toBe(true);
    memory.purpose = "";
    memory.decisions.push({
      id: "choice",
      text: "Keep the ending.",
      createdAt: "2026-01-01",
    });
    expect(hasPieceMemoryContent(memory)).toBe(true);
  });
});

describe("contextual Brief retrieval", () => {
  it("keeps blank Brief quiet and selects only saved Hook audience/destination", () => {
    const doc = newDocument("Brief", "A beginning.");
    doc.sections[0].kind = "Hook";
    const target = targetFor(doc, doc.sections[0].id);
    expect(contextualBrief(doc, target, "coach")).toEqual([]);
    doc.brief.audience = "Experienced readers who dislike jargon";
    doc.brief.destination = "Short video";
    doc.brief.objectives = ["Make the reader reconsider the habit"];
    expect(
      contextualBrief(doc, target, "coach").map((item) => [
        item.field,
        item.value,
      ]),
    ).toEqual([
      ["audience", doc.brief.audience],
      ["destination", doc.brief.destination],
    ]);
  });
  it("surfaces a stated destination for Delivery without inventing platform conventions", () => {
    const doc = newDocument("Delivery", "Wait—then stop.");
    doc.brief.destination = "Short video";
    const target = targetFor(doc, doc.sections[0].id, "selection", 0, 9);
    expect(contextualBrief(doc, target, "words")).toEqual([]);
    expect(contextualBrief(doc, target, "words", true)).toMatchObject([
      { source: "writing_brief", field: "destination", value: "Short video" },
    ]);
  });
  it("keeps evidence, ending and framework preferences tied to their explicit context", () => {
    const doc = newDocument("Partial", "A factual section.");
    doc.brief.objectives = ["Keep the source claim narrow"];
    doc.brief.sourceMaterialType = "article";
    doc.brief.frameworkPreference = "reference_only";
    doc.brief.contentType = "article";
    const target = () => targetFor(doc, doc.sections[0].id);
    doc.sections[0].kind = "Evidence";
    expect(
      contextualBrief(doc, target(), "coach").map((item) => item.field),
    ).toContain("source_material_type");
    expect(
      contextualBrief(doc, target(), "coach").map((item) => item.field),
    ).not.toContain("framework_preference");
    doc.sections[0].kind = "Closer";
    expect(
      contextualBrief(doc, target(), "coach").map((item) => item.field),
    ).toEqual(["objective"]);
    expect(
      contextualBrief(doc, target(), "structure").map((item) => item.field),
    ).toContain("framework_preference");
    doc.brief.audience = "Already familiar readers";
    doc.brief.destination = "Newsletter";
    expect(contextualBrief(doc, target(), "critique")).toHaveLength(3);
  });
});

describe("document backup", () => {
  it("exports selected document-local data without application credentials or global settings", () => {
    const a = newDocument("A", "Human text.");
    const b = newDocument("B", "Different draft.");
    a.pieceMemory.nextMove = "Revise the last line.";
    a.pieceMemory.nextMoveSectionId = a.sections[0].id;
    a.pieceMemory.decisions.push({
      id: "decision",
      text: "Keep the pause.",
      createdAt: a.createdAt,
    });
    a.sources.push({
      id: "source",
      title: "Reference",
      kind: "quote",
      text: "Quoted source.",
      url: "",
    });
    const backup = documentBackup(
      [a],
      [a.id, b.id],
      "2026-01-01T00:00:00.000Z",
    );
    expect(backup).toMatchObject({
      format: "language-workbench-document-backup",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      archivedIds: [a.id],
      documents: [a],
    });
    expect(backup.documents).not.toContain(b);
    expect(backup.documents[0].pieceMemory.nextMove).toBe(
      "Revise the last line.",
    );
    expect(backup.documents[0].pieceMemory.nextMoveSectionId).toBe(
      a.sections[0].id,
    );
    a.pieceMemory.nextMove = "A later edit.";
    expect(backup.documents[0].pieceMemory.nextMove).toBe(
      "Revise the last line.",
    );
    expect(JSON.stringify(backup)).not.toMatch(
      /OPENAI_API_KEY|apiKey|credentialSuffix|styleDNA|personalLibrary/,
    );
  });
});

describe("active document selection", () => {
  it("prefers the selected identity over list order and falls back when it disappears", () => {
    const a = newDocument("Museum", "First draft");
    const b = newDocument("Other", "Recent draft");
    expect(chooseActiveDocument([b, a], a.id)?.id).toBe(a.id);
    expect(chooseActiveDocument([b, a], "deleted")?.id).toBe(b.id);
    expect(chooseActiveDocument([], "deleted")).toBeNull();
  });
});

describe("lightweight text comparison", () => {
  it("isolates punctuation, word and identical text without altering either side", () => {
    expect(textDifference("Yeah.", "Yeah!")).toEqual({
      prefix: "Yeah",
      removed: ".",
      added: "!",
      suffix: "",
    });
    expect(textDifference("Calm closer.", "Loud closer.")).toEqual({
      prefix: "",
      removed: "Calm",
      added: "Loud",
      suffix: " closer.",
    });
    expect(textDifference("Same.", "Same.")).toEqual({
      prefix: "Same.",
      removed: "",
      added: "",
      suffix: "",
    });
  });
});

describe("contained rewrite alignment", () => {
  it("keeps shared words and phrases visibly unchanged without reordering either text", () => {
    const before =
      "The telemarketer called at work. Forty minutes later, I hung up and went back to my desk.";
    const after =
      "That telemarketer kept talking at work. Forty minutes vanished while I tried to finish my shift.";
    const aligned = alignedTextDifference(before, after);
    expect(aligned.before.map((part) => part.text).join("")).toBe(before);
    expect(aligned.after.map((part) => part.text).join("")).toBe(after);
    const common = aligned.after
      .filter((part) => !part.changed)
      .map((part) => part.text)
      .join("");
    for (const phrase of ["telemarketer", "at work", "Forty minutes"])
      expect(common).toContain(phrase);
  });
  it("aligns realistic long rewrites beyond the old cell budget and bounds pathological inputs", () => {
    const before = `${"earlier ".repeat(20)}The thread with Mom is still there. ${"before ".repeat(12)}"You coming home?" Delivered, never read. ${"ECHO ".repeat(37)}`;
    const after = `${"later ".repeat(40)}The thread with Mom is still there. ${"different ".repeat(28)}"You coming home?" Delivered, never read. ${"FINALE ".repeat(40)}`;
    const changed = textDifference(before, after);
    const oldTokens =
      changed.removed.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
    const newTokens =
      changed.added.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
    expect(oldTokens.length * newTokens.length).toBeGreaterThan(40_000);
    const aligned = alignedTextDifference(before, after);
    const shared = aligned.after
      .filter((part) => !part.changed)
      .map((part) => part.text)
      .join("");
    expect(shared).toContain("The thread with Mom is still there");
    expect(shared).toContain("Delivered, never read");
    expect(aligned.before.map((part) => part.text).join("")).toBe(before);
    expect(aligned.after.map((part) => part.text).join("")).toBe(after);
    const hugeBefore = "ALPHA ".repeat(1200),
      hugeAfter = "OMEGA ".repeat(1200);
    const start = performance.now();
    const fallback = alignedTextDifference(hugeBefore, hugeAfter);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(fallback.before.filter((part) => part.changed)).toHaveLength(1);
    expect(fallback.after.filter((part) => part.changed)).toHaveLength(1);
    expect(fallback.before.map((part) => part.text).join("")).toBe(hugeBefore);
    expect(fallback.after.map((part) => part.text).join("")).toBe(hugeAfter);
  });
  it("keeps small punctuation changes precise and identical text unmarked", () => {
    const punctuation = alignedTextDifference("Yeah.", "Yeah!");
    expect(
      punctuation.before
        .filter((part) => part.changed)
        .map((part) => part.text),
    ).toEqual(["."]);
    expect(
      punctuation.after.filter((part) => part.changed).map((part) => part.text),
    ).toEqual(["!"]);
    expect(
      alignedTextDifference("Same.", "Same.").after.every(
        (part) => !part.changed,
      ),
    ).toBe(true);
    expect(
      alignedTextDifference("Yeah", "yeah").after.some((part) => part.changed),
    ).toBe(true);
    expect(
      alignedTextDifference("at  work", "at work").before.some(
        (part) => part.changed,
      ),
    ).toBe(true);
  });
});

describe("live take identity", () => {
  it("matches exact canonical prose, including punctuation, case and spacing", () => {
    const doc = newDocument("Voice", "Yeah.");
    const section = doc.sections[0];
    const target = targetFor(doc, section.id);
    section.variants = [
      {
        id: "calm",
        label: "Calm",
        origin: "human",
        text: "Yeah.",
        target,
        createdAt: doc.createdAt,
      },
      {
        id: "loud",
        label: "Louder",
        origin: "human",
        text: "Yeah!",
        target,
        createdAt: doc.createdAt,
      },
    ];
    expect(currentTakeIds(section)).toEqual(["calm"]);
    section.content = newSection("Freeform", "Yeah!").content;
    expect(currentTakeIds(section)).toEqual(["loud"]);
    section.content = newSection("Freeform", "yeah!").content;
    expect(currentTakeIds(section)).toEqual([]);
    section.content = newSection("Freeform", "Yeah! ").content;
    expect(currentTakeIds(section)).toEqual([]);
  });
});

describe("writer-facing target names", () => {
  it("keeps quoted turns, sentences, selected passages and sections distinct", () => {
    const { capture } = fixture();
    const target = capture.target;
    expect(humanTargetLabel(target)).toBe("Whole section");
    expect(
      humanTargetLabel({ ...target, scope: "selection", unit: "sentence" }),
    ).toBe("Current sentence");
    expect(
      humanTargetLabel({ ...target, scope: "selection", unit: "quoted_turn" }),
    ).toBe("Quoted turn");
    expect(
      humanTargetLabel({ ...target, scope: "selection", unit: "selection" }),
    ).toBe("Selected passage");
    expect(
      humanTargetLabel({ ...target, scope: "word", unit: "selection" }),
    ).toBe("Selected word");
  });
});

describe("Lab result and action truthfulness", () => {
  it("classifies safe, unsupported and unexplained empty proposals without inventing one", () => {
    const { capture, response } = fixture();
    const run = makeRun({ ...capture, stage: "propose" }, response);
    expect(resultOutcome(run)).toEqual({
      title: "No result returned",
      reasons: [],
    });
    expect(
      resultOutcome({
        ...run,
        response: {
          ...response,
          missingIngredients: [
            "No safe offline proposal: A protected quote was changed.",
          ],
        },
      }),
    ).toEqual({
      title: "No safe result",
      reasons: ["No safe offline proposal: A protected quote was changed."],
    });
    expect(
      resultOutcome({
        ...run,
        response: {
          ...response,
          missingIngredients: ["This model cannot return structured output."],
        },
      })?.title,
    ).toBe("Unavailable for this provider");
    expect(resultOutcome({ ...run, stage: "diagnose" })).toBeNull();
    expect(run.response.proposals).toEqual([]);
  });
  it("attributes protected-quote violations to the generated option without losing the reason", () => {
    const reason = "No safe offline proposal: A protected quote was changed.";
    expect(writerResultReason(reason)).toBe(
      "No safe offline proposal: The generated option changed a protected quote.",
    );
    expect(reason).toContain("A protected quote was changed");
  });
  it("names only common approaches specially", () => {
    expect(labActionLabel("coach", "section")).toBe("Diagnose this section");
    expect(labActionLabel("humor", "section")).toBe("Try humor");
    expect(labActionLabel("register", "section")).toBe("Explore register");
    expect(labActionLabel("rhythm", "passage")).toBe("Explore rhythm");
    expect(labActionLabel("technical", "section")).toBe(
      "Diagnose this section",
    );
  });
  it("keeps answers for distinct saved questions isolated during inspection", () => {
    const { doc, a, capture, response } = fixture();
    const first = makeRun(
      { ...capture, stage: "diagnose", answer: "" },
      response,
    );
    let next = appendRun(doc, first);
    next = updateWorkbench(next, a.id, (wb) => ({
      ...wb,
      questionAnswers: { ...wb.questionAnswers, [first.id]: "Answer A" },
    }));
    const second = makeRun(
      { ...capture, stage: "propose", answer: "Answer A" },
      { ...response, question: "Question B?" },
    );
    next = appendRun(next, second);
    const wb = getWorkbench(next, a.id);
    expect(wb.questionAnswers[first.id]).toBe("Answer A");
    expect(wb.questionAnswers[second.id]).toBe("");
    expect(inspectRun(wb, first.id).questionAnswers[first.id]).toBe("Answer A");
    expect(inspectRun(wb, second.id).questionAnswers[second.id]).toBe("");
    const third = makeRun(
      { ...capture, stage: "propose", answer: "Answer B" },
      { ...response, question: "Question B?" },
    );
    const same = appendRun(
      updateWorkbench(next, a.id, (current) => ({
        ...current,
        questionAnswers: {
          ...current.questionAnswers,
          [second.id]: "Answer B",
        },
      })),
      third,
    );
    expect(getWorkbench(same, a.id).questionAnswers[third.id]).toBe("Answer B");
  });
});

describe("linked Next move section labels", () => {
  it("resolves current order, custom label and role by stable section ID", () => {
    const doc = newDocument("Resume", "First.");
    const ending = newSection("Closer", "End.");
    ending.label = "Ending";
    doc.sections.push(ending);
    expect(nextMoveSectionLabel(doc, ending.id)).toBe("02 · Ending · Closer");
    doc.sections.reverse();
    expect(nextMoveSectionLabel(doc, ending.id)).toBe("01 · Ending · Closer");
    ending.kind = "Point";
    expect(nextMoveSectionLabel(doc, ending.id)).toBe("01 · Ending · Point");
    expect(nextMoveSectionLabel(doc, "missing")).toBeNull();
  });
});

describe("writer-facing section references", () => {
  it("resolves custom labels, roles, numbered Freeform cards and only known IDs", () => {
    const doc = newDocument("Nine cards", "A first thought.");
    for (let i = 1; i < 9; i++)
      doc.sections.push(newSection("Freeform", `Thought ${i + 1}`));
    doc.sections[1].label = "The list starts lying";
    doc.sections[2].label = "What arranging did";
    doc.sections[7].kind = "Callback";
    doc.sections[7].label = "Callback";
    expect(sectionReference(doc, doc.sections[1].id)).toBe(
      "The list starts lying",
    );
    expect(sectionReference(doc, doc.sections[7].id)).toBe(
      "Callback · Section 8",
    );
    expect(sectionReference(doc, doc.sections[3].id)).toBe("Section 4");
    const unknown = "00000000-0000-4000-8000-000000000000";
    const text = `Sections 2 and 3 echo; ${doc.sections[7].id} returns. ${unknown} is unrecognized.`;
    const parts = sectionMentions(doc, text);
    expect(
      parts.filter((part) => part.sectionId).map((part) => part.sectionId),
    ).toEqual([doc.sections[1].id, doc.sections[2].id, doc.sections[7].id]);
    const rendered = parts.map((part) => part.text).join("");
    expect(rendered).toContain("The list starts lying and What arranging did");
    expect(rendered).toContain("Callback · Section 8");
    expect(rendered).toContain(unknown);
    expect(rendered).not.toContain(doc.sections[7].id);
  });
});

describe("analysis draft state", () => {
  it("ignores metadata revisions but marks a run earlier immediately after prose changes", () => {
    const { doc, capture, response } = fixture();
    const run = makeRun({ ...capture, target: documentTarget(doc) }, response);
    expect(runDraftState(doc, run)).toBe("Current draft");
    const metadataOnly = {
      ...doc,
      revision: doc.revision + 1,
      title: "New title",
    };
    expect(runDraftState(metadataOnly, run)).toBe("Current draft");
    const changed = structuredClone(metadataOnly);
    changed.sections[1].content = newSection(
      "Hook",
      "This prose changed.",
    ).content;
    expect(runDraftState(changed, run)).toBe("Earlier draft");
    expect(run.target.documentRevision).toBe(doc.revision);
    expect(runDraftState(doc, run)).toBe("Current draft");
  });
});

describe("canonical section workbenches", () => {
  it("derives fresh defaults without sharing mutable fields or eagerly migrating documents", () => {
    const { doc, a, b } = fixture();
    const first = getWorkbench(doc, a.id);
    first.compareModels.push({ providerId: "mock", modelId: "one" });
    expect(getWorkbench(doc, b.id).compareModels).toEqual([]);
    expect(doc.sections[0].workbench).toBeUndefined();
  });

  it("isolates section drafts, answer choices, controls, and model overrides", () => {
    const { doc, a, b } = fixture();
    const next = updateWorkbench(doc, a.id, (wb) => ({
      ...wb,
      instruction: "A draft",
      answer: "Choice A",
      controls: { technical: true },
      oneOffModel: { providerId: "mock", modelId: "one" },
    }));
    const latest = updateWorkbench(next, b.id, (wb) => ({
      ...wb,
      instruction: "B draft",
      action: "shorten",
    }));
    expect(getWorkbench(latest, a.id)).toMatchObject({
      instruction: "A draft",
      answer: "Choice A",
      controls: { technical: true },
    });
    expect(getWorkbench(latest, b.id)).toMatchObject({
      instruction: "B draft",
      answer: "",
      action: "shorten",
      oneOffModel: null,
    });
    expect(latest.sections.map(sectionText)).toEqual(
      doc.sections.map(sectionText),
    );
  });

  it("persists diagnosis-only responses and metadata through the shared document schema", () => {
    const { doc, a, capture, response } = fixture();
    const run = makeRun(capture, {
      ...response,
      model: capture.model!,
      routeSource: "section",
    });
    const next = documentSchema.parse(appendRun(doc, run));
    expect(getWorkbench(next, a.id)).toMatchObject({
      activeRunId: run.id,
      runs: [run],
    });
    expect(next.history).toEqual([]);
    expect(next.sections[0].variants).toEqual([]);
  });

  it("lands delayed responses in the originating section without overwriting newer drafts or other sections", () => {
    const { doc, a, b, capture, response } = fixture();
    const run = makeRun(capture, response);
    const changed = updateWorkbench(
      updateWorkbench(doc, b.id, (wb) => ({ ...wb, instruction: "New B" })),
      a.id,
      (wb) => ({
        ...wb,
        instruction: "Typed while waiting",
        answer: "New answer",
      }),
    );
    const next = appendRun(changed, run);
    expect(getWorkbench(next, a.id)).toMatchObject({
      instruction: "Typed while waiting",
      answer: "New answer",
      runs: [run],
    });
    expect(next.sections[1]).toBe(changed.sections[1]);
    expect(getWorkbench(next, b.id).instruction).toBe("New B");
  });

  it("refuses late results for switched documents and removed sections rather than silently dropping them", () => {
    const { doc, capture, response } = fixture();
    const run = makeRun(capture, response);
    expect(() => appendRun(newDocument(), run)).toThrow("originating document");
    expect(() =>
      appendRun({ ...doc, sections: doc.sections.slice(1) }, run),
    ).toThrow("originating section");
  });

  it("separates whole-document critique from local runs", () => {
    const { doc, a, capture, response } = fixture();
    const local = makeRun(capture, response);
    const whole = makeRun(
      { ...capture, action: "critique", target: documentTarget(doc) },
      response,
    );
    const next = appendRun(appendRun(doc, local), whole);
    expect(getWorkbench(next, null).runs).toEqual([whole]);
    expect(getWorkbench(next, a.id).runs).toEqual([local]);
  });

  it("stores independent comparison variants, model provenance, and history without activating any text", () => {
    const { doc, a, capture, response } = fixture();
    const proposals = [
      {
        id: "provider-id",
        label: "Candidate",
        text: "Candidate text.",
        explanation: "More direct",
      },
    ];
    const r1 = makeRun(capture, { ...response, proposals });
    const r2 = makeRun(
      { ...capture, model: { providerId: "other", modelId: "two" } },
      { ...response, proposals },
    );
    const next = appendRun(appendRun(doc, r1, "", true), r2, "", true);
    expect(next.sections.map(sectionText)).toEqual(
      doc.sections.map(sectionText),
    );
    expect(next.sections[0].variants).toHaveLength(2);
    expect(next.sections[0].variants.map((v) => v.runId)).toEqual([
      r1.id,
      r2.id,
    ]);
    expect(next.history.map((h) => h.model?.modelId)).toEqual(["one", "two"]);
    expect(next.history[0].id).not.toBe(next.history[1].id);
    expect(getWorkbench(next, a.id).activeRunId).toBe(r2.id);
    expect(next.history.every((h) => h.state === "saved")).toBe(true);
  });

  it("keeps proposal action buttons available until an explicit outcome", () => {
    const { doc, a, capture, response } = fixture();
    const run = makeRun(capture, {
      ...response,
      proposals: [
        { id: "p", label: "Candidate", text: "New", explanation: "" },
      ],
    });
    const next = appendRun(doc, run);
    expect(next.history[0].state).toBe("proposed");
    expect(
      getWorkbench(next, a.id).proposalStates[run.response.proposals[0].id],
    ).toBeUndefined();
  });

  it("edits inspected proposal and matching history, never canonical text or another run", () => {
    const { doc, a, capture, response } = fixture();
    const run = makeRun(capture, {
      ...response,
      proposals: [
        { id: "p", label: "Candidate", text: "New", explanation: "" },
      ],
    });
    const proposalId = run.response.proposals[0].id;
    const next = editRunProposal(
      appendRun(doc, run),
      a.id,
      run.id,
      proposalId,
      "Human edited",
    );
    expect(getWorkbench(next, a.id).runs[0].response.proposals[0].text).toBe(
      "Human edited",
    );
    expect(next.history[0].proposal).toBe("Human edited");
    expect(sectionText(next.sections[0])).toBe(sectionText(doc.sections[0]));
  });

  it("restores a selected historical run input and answer choices without replacing routes or lens preferences", () => {
    const { doc, a, capture, response } = fixture();
    const run = makeRun(capture, response);
    const wb = getWorkbench(appendRun(doc, run), a.id);
    const changed = {
      ...wb,
      instruction: "Other",
      answer: "",
      controls: {},
      action: "shorten",
    };
    expect(inspectRun(changed, run.id)).toMatchObject({
      activeRunId: run.id,
      instruction: capture.instruction,
      answer: capture.answer,
      controls: capture.controls,
      action: "coach",
      lens: wb.lens,
    });
    expect(inspectRun(changed, "missing")).toBe(changed);
    expect(forkWorkbench(wb, "copy")?.runs[0].target.documentId).toBe("copy");
    expect(wb.runs[0].target.documentId).toBe(doc.id);
  });

  it("distinguishes explicit short phrase selections from cursor-targeted sentences", () => {
    const { capture } = fixture();
    const sentence = {
      ...capture.target,
      scope: "selection" as const,
      text: "A short sentence.",
    };
    expect(isLensTarget(sentence, false)).toBe(false);
    // A complete punctuated sentence stays in the existing sentence workbench.
    expect(isLensTarget(sentence, true)).toBe(false);
    expect(
      isLensTarget({ ...sentence, text: "performing false status" }, true),
    ).toBe(true);
    expect(
      isLensTarget(
        { ...sentence, text: "one two three four five six seven eight nine" },
        true,
      ),
    ).toBe(false);
    expect(isLensTarget({ ...sentence, scope: "word" }, true)).toBe(true);
    expect(isLensTarget(null, true)).toBe(false);
  });
  it("admits punctuation, full sentences and short line breaks for Delivery without broadening lexical replacement", () => {
    const { capture } = fixture();
    const sentence = {
      ...capture.target,
      scope: "selection" as const,
      text: "Dre, please.",
    };
    expect(isLensTarget(sentence, true)).toBe(false);
    expect(isDeliveryTarget(sentence)).toBe(true);
    expect(isDeliveryTarget({ ...sentence, scope: "word", text: "." })).toBe(
      true,
    );
    expect(
      isDeliveryTarget({ ...sentence, text: "one line\nsecond line" }),
    ).toBe(true);
    expect(isDeliveryTarget({ ...sentence, text: "word ".repeat(61) })).toBe(
      false,
    );
    expect(isDeliveryTarget({ ...sentence, text: "a\nb\nc\nd\ne" })).toBe(
      false,
    );
    expect(isDeliveryTarget(null)).toBe(false);
  });
});
