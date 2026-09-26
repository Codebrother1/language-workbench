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
  sectionReference,
  sectionMentions,
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
});
