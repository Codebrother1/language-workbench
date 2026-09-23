import { describe, expect, it } from "vitest";
import {
  documentSchema,
  documentTarget,
  duplicateSection,
  emptyWorkbench,
  newDocument,
  newSection,
  paragraphs,
  targetFor,
} from "./domain";
import {
  canCoachTarget,
  getTargetDraft,
  patchTargetDraft,
  restoreFocusTarget,
  sameFocusTarget,
  targetDraftKey,
  withFocusTarget,
} from "./target-drafts";
import { forkWorkbench, inspectRun, makeRun } from "./workspace-helpers";

function fixture() {
  const doc = newDocument("Drafts", "Same word. Same word.");
  doc.sections.push(newSection("Hook", "Neighbor context."));
  const section = targetFor(doc, doc.sections[0].id);
  const sentence = targetFor(doc, section.sectionId!, "selection", 0, 10);
  const word = targetFor(doc, section.sectionId!, "word", 0, 4);
  const repeated = targetFor(doc, section.sectionId!, "word", 11, 15);
  return { doc, section, sentence, word, repeated };
}

describe("target-scoped directions", () => {
  it("never copies section direction into a sentence or word and restores each exact draft", () => {
    const { section, sentence, word, repeated } = fixture();
    let wb = patchTargetDraft(emptyWorkbench(), section, {
      instruction: "Whole Hook",
      answer: "Whole answer",
    });
    expect(getTargetDraft(wb, sentence)).toEqual({
      instruction: "",
      answer: "",
    });
    wb = patchTargetDraft(wb, sentence, {
      instruction: "Sentence only",
      answer: "Sentence answer",
    });
    wb = patchTargetDraft(wb, word, { instruction: "Word only" });
    wb = patchTargetDraft(wb, repeated, { instruction: "Repeated word" });
    expect(getTargetDraft(wb, section)).toEqual({
      instruction: "Whole Hook",
      answer: "Whole answer",
    });
    expect(getTargetDraft(wb, sentence)).toEqual({
      instruction: "Sentence only",
      answer: "Sentence answer",
    });
    expect(getTargetDraft(wb, word)).toEqual({
      instruction: "Word only",
      answer: "",
    });
    expect(getTargetDraft(wb, repeated).instruction).toBe("Repeated word");
  });
  it("keys include scope, offsets and exact text, but not revision or surrounding snapshot", () => {
    const { word, repeated } = fixture();
    const saved = patchTargetDraft(emptyWorkbench(), word, {
      instruction: "Precise",
    });
    const refreshed = {
      ...word,
      documentRevision: 99,
      sectionSnapshot: word.sectionSnapshot + " More.",
    };
    expect(targetDraftKey(refreshed)).toBe(targetDraftKey(word));
    expect(getTargetDraft(saved, refreshed).instruction).toBe("Precise");
    expect(targetDraftKey(repeated)).not.toBe(targetDraftKey(word));
    expect(
      getTargetDraft(saved, { ...word, scope: "selection" }).instruction,
    ).toBe("");
    expect(getTargetDraft(saved, { ...word, text: "Else" }).instruction).toBe(
      "",
    );
    expect(
      getTargetDraft(saved, { ...word, sectionId: "other" }).instruction,
    ).toBe("");
  });
  it("captures the response target's draft even if another target is active", () => {
    const { word, sentence } = fixture();
    let wb = patchTargetDraft(emptyWorkbench(), word, {
      instruction: "Word direction",
      answer: "Word material",
    });
    wb = patchTargetDraft(wb, sentence, {
      instruction: "Sentence direction",
      answer: "Sentence material",
    });
    expect(getTargetDraft(wb, word)).toEqual({
      instruction: "Word direction",
      answer: "Word material",
    });
  });
  it("inspection restores only the historical target draft, preserving section and other local drafts", () => {
    const { word, sentence, section } = fixture();
    let wb = patchTargetDraft(emptyWorkbench(), section, {
      instruction: "Section direction",
    });
    wb = patchTargetDraft(wb, sentence, { answer: "Other draft" });
    const run = makeRun(
      {
        target: word,
        action: "coach",
        instruction: "Historical word direction",
        answer: "Historical answer",
        controls: {},
        model: null,
        question: "",
      },
      {
        provider: "mock",
        diagnosis: "",
        mechanism: "",
        question: "Question?",
        missingIngredients: [],
        proposals: [],
        findings: [],
        lexical: [],
      },
    );
    wb = inspectRun({ ...wb, runs: [run] }, run.id);
    expect(getTargetDraft(wb, word).answer).toBe("Historical answer");
    expect(getTargetDraft(wb, section).instruction).toBe("Section direction");
    expect(getTargetDraft(wb, sentence).answer).toBe("Other draft");
  });
  it("forks and duplicates remap draft ownership without sharing mutable drafts", () => {
    const { doc, word } = fixture();
    doc.sections[0].workbench = patchTargetDraft(emptyWorkbench(), word, {
      instruction: "Keep me",
    });
    const fork = forkWorkbench(doc.sections[0].workbench, "fork")!;
    expect(
      getTargetDraft(fork, { ...word, documentId: "fork" }).instruction,
    ).toBe("Keep me");
    const copy = duplicateSection(doc, word.sectionId!);
    const copied = copy.sections[1];
    expect(
      getTargetDraft(copied.workbench!, { ...word, sectionId: copied.id })
        .instruction,
    ).toBe("Keep me");
    copied.workbench!.targetDrafts![targetDraftKey(word)].instruction =
      "Independent";
    expect(getTargetDraft(doc.sections[0].workbench, word).instruction).toBe(
      "Keep me",
    );
  });
});

describe("focus metadata and snapshot restoration", () => {
  it("persists focus in a PUT snapshot without mutating canonical input", () => {
    const { doc, word } = fixture();
    const snapshot = withFocusTarget(doc, word);
    expect(doc.focusTarget).toBeUndefined();
    const restored = documentSchema.parse(snapshot);
    restored.revision = 12;
    expect(restoreFocusTarget(restored)).toEqual({
      ...word,
      documentRevision: 12,
    });
  });
  it("falls back to the matching whole section for stale snapshots rather than reanchoring repeated text", () => {
    const { doc, word } = fixture();
    const changed = withFocusTarget(doc, word);
    changed.sections = [
      {
        ...doc.sections[0],
        content: paragraphs("Prefix. Same word. Same word."),
      },
      doc.sections[1],
    ];
    expect(restoreFocusTarget(changed)).toEqual(
      targetFor(changed, word.sectionId!),
    );
  });
  it("rejects invalid local offsets even when section snapshot matches", () => {
    const { doc, word } = fixture();
    expect(restoreFocusTarget(doc, { ...word, end: 999 })).toEqual(
      targetFor(doc, word.sectionId!),
    );
    expect(restoreFocusTarget(doc, { ...word, text: "wrong" })).toEqual(
      targetFor(doc, word.sectionId!),
    );
  });
  it("does not revive foreign or removed target ownership", () => {
    const { doc, word } = fixture();
    expect(
      withFocusTarget(doc, { ...word, documentId: "other" }).focusTarget,
    ).toBeNull();
    expect(restoreFocusTarget(doc, { ...word, sectionId: "removed" })).toEqual(
      targetFor(doc, doc.sections[0].id),
    );
    expect(restoreFocusTarget(doc, { ...word, documentId: "other" })).toEqual(
      targetFor(doc, doc.sections[0].id),
    );
  });
  it("restores empty section and whole-document focus explicitly", () => {
    const doc = newDocument();
    const section = targetFor(doc, doc.sections[0].id);
    expect(restoreFocusTarget(withFocusTarget(doc, section))).toEqual(section);
    expect(
      restoreFocusTarget(withFocusTarget(doc, documentTarget(doc))),
    ).toEqual(documentTarget(doc));
  });
  it("ignores autosave revision updates when deciding whether focus needs another save", () => {
    const { word } = fixture();
    expect(sameFocusTarget(word, { ...word, documentRevision: 3 })).toBe(true);
    expect(sameFocusTarget(word, { ...word, scope: "selection" })).toBe(false);
    expect(sameFocusTarget(word, { ...word, sectionSnapshot: "changed" })).toBe(
      false,
    );
    expect(sameFocusTarget(null, null)).toBe(true);
    expect(sameFocusTarget(word, null)).toBe(false);
  });
});

describe("empty-section coaching context", () => {
  it("enables coaching for section notes, neighbors, directions, and brief content, not an empty document", () => {
    const doc = newDocument();
    const t = targetFor(doc, doc.sections[0].id);
    expect(canCoachTarget(doc, t, "")).toBe(false);
    expect(canCoachTarget(doc, t, "Make the transition explicit")).toBe(true);
    expect(
      canCoachTarget(
        { ...doc, brief: { ...doc.brief, audience: "Students" } },
        t,
        "",
      ),
    ).toBe(true);
    expect(
      canCoachTarget(
        { ...doc, sections: [{ ...doc.sections[0], notes: "Connect these" }] },
        t,
        "",
      ),
    ).toBe(true);
    expect(
      canCoachTarget(
        {
          ...doc,
          sections: [
            ...doc.sections,
            newSection("Point", "Something to connect"),
          ],
        },
        t,
        "",
      ),
    ).toBe(true);
    expect(canCoachTarget(doc, null, "Direction")).toBe(false);
  });
});

it("rejects ambiguous section identities before saving or importing canonical topology", () => {
  const doc = newDocument("Unique", "One.");
  expect(
    documentSchema.safeParse({
      ...doc,
      sections: [doc.sections[0], structuredClone(doc.sections[0])],
    }).success,
  ).toBe(false);
  expect(
    documentSchema.safeParse({
      ...doc,
      sections: [{ ...doc.sections[0], id: "" }],
    }).success,
  ).toBe(false);
});
