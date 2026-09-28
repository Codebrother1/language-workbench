import { describe, expect, it } from "vitest";
import {
  createLibraryItem,
  libraryDelta,
  makeHumanRun,
  contextualGuidance,
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
  defaultSettings,
  emptyStructure,
  renderScaffold,
  type PersonalLibrary,
} from "../packages/domain/src";

describe("contextual saved writing guidance", () => {
  it("surfaces scoped section rules, matching moves and customized Style DNA without unrelated items", () => {
    const style = {
      ...defaultSettings().styleDNA,
      rhythm: "Keep the abrupt turn.",
    };
    const rule = {
      ...createLibraryItem({
        kind: "style_rule",
        content: "Leave the punchline unexplained.",
      }),
      title: "Hook restraint",
      sectionKinds: ["Hook"],
    };
    const move = {
      ...createLibraryItem({
        kind: "move",
        content: "Name the object, then stop.",
      }),
      sectionKinds: ["Hook"],
      title: "Opening move",
    };
    const other = {
      ...createLibraryItem({ kind: "move", content: "Finish the scene." }),
      sectionKinds: ["Closer"],
    };
    const doc = newDocument("Example", "A first sentence.");
    doc.sections[0].kind = "Hook";
    const target = targetFor(doc, doc.sections[0].id, "selection", 0, 16);
    const items = contextualGuidance({
      doc,
      target,
      action: "coach",
      styleDNA: style,
      library: { ...emptyLibrary(), items: [other, move, rule] },
    });
    expect(items.map((item) => item.text)).toEqual([
      rule.content,
      style.rhythm,
      move.content,
    ]);
    expect(items.map((item) => item.source)).toEqual([
      "section_style",
      "style_dna",
      "library",
    ]);
    expect(items[2].kind).toBe("move");
  });
  it("matches a saved ending rule by explicit rule key rather than inferred prose meaning", () => {
    const doc = newDocument("Draft", "Do not end with a summary.");
    doc.sections[0].kind = "Closer";
    const rule = {
      ...createLibraryItem({
        kind: "style_rule",
        title: "My ending rule",
        content: "Stop at the precise line.",
      }),
      ruleKey: "endingStyles",
    };
    const items = contextualGuidance({
      doc,
      target: targetFor(doc, doc.sections[0].id),
      action: "coach",
      styleDNA: defaultSettings().styleDNA,
      library: { ...emptyLibrary(), items: [rule] },
    });
    expect(items).toMatchObject([
      {
        source: "library",
        kind: "style_rule",
        itemId: rule.id,
        text: rule.content,
      },
    ]);
  });
  it("offers only saved connector preferences in Segues, suppresses duplicates, and never fills an empty profile", () => {
    const doc = newDocument("Draft", "First section.");
    doc.sections[0].kind = "Segue";
    const connector = {
      ...createLibraryItem({
        kind: "connector",
        content: "Prefer 'but' over formal transitions.",
      }),
      title: "My connector",
    };
    const duplicate = {
      ...createLibraryItem({
        kind: "move",
        content: "Prefer 'but' over formal transitions.",
      }),
      sectionKinds: ["Segue"],
    };
    const extra = Array.from({ length: 5 }, (_, index) => ({
      ...createLibraryItem({ kind: "move", content: `Saved bridge ${index}.` }),
      sectionKinds: ["Segue"],
    }));
    const target = targetFor(doc, doc.sections[0].id);
    expect(
      contextualGuidance({
        doc,
        target,
        action: "coach",
        styleDNA: defaultSettings().styleDNA,
        library: emptyLibrary(),
      }),
    ).toEqual([]);
    const items = contextualGuidance({
      doc,
      target,
      action: "coach",
      styleDNA: defaultSettings().styleDNA,
      library: { ...emptyLibrary(), items: [connector, duplicate, ...extra] },
    });
    expect(items).toHaveLength(3);
    expect(
      items.filter((item) => item.text === connector.content),
    ).toHaveLength(1);
    expect(items.some((item) => item.source === "connector")).toBe(true);
  });
});

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
