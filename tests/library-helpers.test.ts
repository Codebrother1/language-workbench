import { describe, expect, it } from "vitest";
import {
  createLibraryItem,
  libraryDelta,
  makeHumanRun,
} from "../apps/web/src/library-helpers";
import {
  appendRun,
  getWorkbench,
  inspectRun,
} from "../apps/web/src/workspace-helpers";
import {
  newDocument,
  newSection,
  targetFor,
  sectionText,
  documentSchema,
  emptyLibrary,
  emptyStructure,
  renderScaffold,
  type PersonalLibrary,
} from "../packages/domain/src";

describe("personal library workbench helpers", () => {
  it("saves verbatim user text without inferring rules or style preferences", () => {
    const content = "  My exact—text.\nNot a generated rule.  ";
    const item = createLibraryItem({ kind: "snippet", content });
    expect(item.content).toBe(content);
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBe(item.updatedAt);
    expect(item.ruleKey).toBe("");
    expect(item.sectionKinds).toEqual([]);
    expect(item.preference).toBe("reference");
    expect(item.useCount).toBe(0);
  });

  it("rebases pending updates on the returned CAS revision without losing imported items", () => {
    const a = createLibraryItem({ kind: "snippet", content: "A" });
    const b = createLibraryItem({ kind: "snippet", content: "Imported B" });
    const before: PersonalLibrary = {
      ...emptyLibrary(),
      revision: 4,
      items: [a],
    };
    const delta = libraryDelta(before, {
      ...before,
      items: [{ ...a, content: "Edited A" }],
    });
    const result = delta({ ...before, revision: 6, items: [a, b] });
    expect(result.revision).toBe(6);
    expect(result.items.map((item) => item.content)).toEqual([
      "Edited A",
      "Imported B",
    ]);
    expect(before.items[0].content).toBe("A");
  });

  it("keeps explicit deletes and additions across an in-flight import", () => {
    const a = createLibraryItem({ kind: "snippet", content: "A" });
    const b = createLibraryItem({ kind: "pattern", content: "B" });
    const c = createLibraryItem({ kind: "snippet", content: "C" });
    const before = { ...emptyLibrary(), items: [a] };
    const remove = libraryDelta(before, { ...before, items: [] });
    const add = libraryDelta(
      { ...before, items: [] },
      { ...before, items: [c] },
    );
    const result = add(remove({ ...before, revision: 8, items: [a, b] }));
    expect(result.items.map((item) => item.id)).toEqual([b.id, c.id]);
    expect(result.revision).toBe(8);
  });

  it("creates a human-library proposal/history entry without changing canonical text or variants", () => {
    const doc = newDocument("Draft", "Original text.");
    doc.sections.push(newSection("Hook", "Other section."));
    const target = targetFor(doc, doc.sections[0].id);
    const exact = "  Saved\ntext—unchanged.  ";
    const run = makeHumanRun({
      target,
      workbench: getWorkbench(doc, target.sectionId),
      text: exact,
      title: "My snippet",
      instruction: "Saved item abc: My snippet",
      provider: "human-library",
    });
    const next = documentSchema.parse(appendRun(doc, run));
    expect(next.sections.map(sectionText)).toEqual(
      doc.sections.map(sectionText),
    );
    expect(next.sections[0].variants).toEqual([]);
    expect(next.history[0]).toMatchObject({
      state: "proposed",
      proposal: exact,
      provider: "human-library",
    });
    expect(run.model).toBeNull();
    expect(run.action).toBe("coach");
    expect(run.response.proposals[0].text).toBe(exact);
    expect(getWorkbench(next, doc.sections[1].id).runs).toEqual([]);
  });

  it("stages empty targets and preserves structure provenance independently of later draft edits", () => {
    const doc = newDocument();
    const target = targetFor(doc, doc.sections[0].id, "selection", 0, 0);
    const draft = {
      ...emptyStructure(),
      raw: "my raw notes",
      thoughtA: "A",
      thoughtB: "B",
    };
    const structure = {
      mode: "tighten" as const,
      draft,
      scaffold: "[X], but [Y].",
      preview: renderScaffold("[X], but [Y].", "A", "B"),
    };
    const wb = {
      ...getWorkbench(doc, target.sectionId),
      oneOffModel: { providerId: "mock", modelId: "keep" },
    };
    const run = makeHumanRun({
      target,
      workbench: wb,
      text: structure.preview,
      title: "Structure",
      instruction: "User assembled",
      provider: "human-structure",
      structure,
    });
    const next = documentSchema.parse(appendRun(doc, run));
    expect(next.sections.map(sectionText)).toEqual(
      doc.sections.map(sectionText),
    );
    draft.thoughtA = "Changed later";
    expect(run.structure?.draft.thoughtA).toBe("A");
    const inspected = inspectRun({ ...wb, runs: [run] }, run.id);
    expect(inspected.structure?.raw).toBe("my raw notes");
    expect(inspected.structure?.thoughtA).toBe("A");
    expect(inspected.oneOffModel).toEqual(wb.oneOffModel);
    inspected.structure!.thoughtA = "Changed in inspection";
    expect(run.structure?.draft.thoughtA).toBe("A");
  });
});
