import { describe, expect, it } from "vitest";
import {
  emptyStructure,
  relationshipIds,
  renderScaffold,
  segmentRawThoughts,
  structureDraftSchema,
  suggestRelationships,
  writingRegisters,
  type RelationshipId,
} from "../packages/domain/src/composition";
import {
  compositionKnowledge,
  connectorsFor,
  getRelationship,
  scaffoldsFor,
} from "../packages/domain/src/composition-knowledge";

const rant =
  "I liked the tool and it did what I needed but it was too expensive and I didn’t really realize how much I was spending until later.";

describe("original composition handbook", () => {
  it("covers exactly the complete 17 relationship IDs once, in the declared order", () => {
    expect(relationshipIds).toHaveLength(17);
    expect(compositionKnowledge.map((item) => item.id)).toEqual([
      ...relationshipIds,
    ]);
    expect(new Set(compositionKnowledge.map((item) => item.id)).size).toBe(17);
  });
  it.each(relationshipIds)(
    "%s has a usable principle, question, distinct connectors and slotted scaffolds",
    (id) => {
      const relationship = getRelationship(id);
      expect(relationship.label.length).toBeGreaterThan(8);
      expect(relationship.principle.length).toBeGreaterThan(80);
      expect(relationship.question).toContain("?");
      expect(relationship.connectors.length).toBeGreaterThanOrEqual(3);
      expect(relationship.scaffolds.length).toBeGreaterThanOrEqual(3);
      expect(
        new Set(relationship.connectors.map((item) => item.text)).size,
      ).toBe(relationship.connectors.length);
      for (const item of relationship.connectors) {
        expect(item.id.startsWith(`${id}-`)).toBe(true);
        expect(item.text.trim()).not.toBe("");
        expect(item.distinction.length).toBeGreaterThan(50);
        expect(item.registers.length).toBeGreaterThan(0);
        expect(
          item.registers.every((register) =>
            writingRegisters.includes(register),
          ),
        ).toBe(true);
      }
      for (const item of relationship.scaffolds) {
        expect(item.id.startsWith(`${id}-`)).toBe(true);
        expect(item.template).toContain("[X]");
        expect(item.template).toContain("[Y]");
        expect(item.effect.length).toBeGreaterThan(50);
        expect(item.registers.length).toBeGreaterThan(0);
        expect(
          item.registers.every((register) =>
            writingRegisters.includes(register),
          ),
        ).toBe(true);
      }
    },
  );
  it("has globally unique IDs within each option family", () => {
    const connectorIds = compositionKnowledge.flatMap((item) =>
      item.connectors.map((option) => option.id),
    );
    const scaffoldIds = compositionKnowledge.flatMap((item) =>
      item.scaffolds.map((option) => option.id),
    );
    expect(new Set(connectorIds).size).toBe(connectorIds.length);
    expect(new Set(scaffoldIds).size).toBe(scaffoldIds.length);
  });
  it("rejects an unknown relationship instead of silently choosing one", () => {
    expect(() => getRelationship("invented" as RelationshipId)).toThrow(
      RangeError,
    );
  });
  it.each(relationshipIds)(
    "%s filters registers by any-plus-match, with genuinely different choices",
    (id) => {
      const relationship = getRelationship(id);
      expect(connectorsFor(id, "any")).toEqual(relationship.connectors);
      expect(scaffoldsFor(id, "any")).toEqual(relationship.scaffolds);
      for (const register of writingRegisters) {
        expect(connectorsFor(id, register)).toEqual(
          relationship.connectors.filter(
            (item) =>
              register === "any" ||
              item.registers.includes("any") ||
              item.registers.includes(register),
          ),
        );
        expect(scaffoldsFor(id, register)).toEqual(
          relationship.scaffolds.filter(
            (item) =>
              register === "any" ||
              item.registers.includes("any") ||
              item.registers.includes(register),
          ),
        );
        expect(connectorsFor(id, register).length).toBeGreaterThan(0);
        expect(scaffoldsFor(id, register).length).toBeGreaterThan(0);
      }
      expect(
        connectorsFor(id, "conversational").map((item) => item.id),
      ).not.toEqual(connectorsFor(id, "technical").map((item) => item.id));
      expect(
        scaffoldsFor(id, "conversational").map((item) => item.template),
      ).not.toEqual(scaffoldsFor(id, "technical").map((item) => item.template));
    },
  );
  it("keeps neutral but available while separating however from conversational that said", () => {
    const spoken = connectorsFor("contrast", "conversational").map(
      (item) => item.text,
    );
    const technical = connectorsFor("contrast", "technical").map(
      (item) => item.text,
    );
    expect(spoken).toContain("but");
    expect(technical).toContain("but");
    expect(spoken).toContain("that said");
    expect(spoken).not.toContain("however");
    expect(technical).toContain("however");
    expect(technical).not.toContain("that said");
  });
  it("teaches the required contrast connectors as different grammatical and rhetorical choices", () => {
    const options = Object.fromEntries(
      getRelationship("contrast").connectors.map((item) => [
        item.text,
        item.distinction,
      ]),
    );
    for (const text of [
      "but",
      "however",
      "yet",
      "still",
      "even so",
      "that said",
      "except",
    ])
      expect(options[text]).toBeTruthy();
    expect(options.but).toMatch(/clause-level/);
    expect(options.however).toMatch(/semicolon/);
    expect(options.yet).toMatch(/surprising/);
    expect(options.still).toMatch(/time/);
    expect(options["even so"]).toMatch(/concessive/);
    expect(options["that said"]).toMatch(/qualification/);
    expect(options.except).toMatch(/noun phrase/);
  });
  it("distinguishes contrast from concession and an explanation from a result", () => {
    expect(getRelationship("contrast").principle).toContain(
      "Contrast does not require an expectation to be defeated",
    );
    expect(getRelationship("concede").principle).toContain("Accept X");
    expect(getRelationship("cause").principle).toContain("why X");
    expect(getRelationship("result").principle).toContain("basis X");
    expect(getRelationship("cause").scaffolds[0].template).toBe(
      "[X] because [Y].",
    );
    expect(getRelationship("result").scaffolds[0].template).toBe(
      "[X]. As a result, [Y].",
    );
  });
  it("does not mistake conditions for evidence or reverse necessary and sufficient conditions", () => {
    const knowledge = getRelationship("condition");
    expect(knowledge.principle).toMatch(/sufficiency/);
    expect(knowledge.principle).toMatch(/necessary/);
    expect(knowledge.principle).toMatch(/Neither wording proves/);
    expect(
      knowledge.scaffolds.find((item) => item.id === "condition-sufficient")
        ?.template,
    ).toBe("If [X], then [Y].");
    expect(
      knowledge.scaffolds.find((item) => item.id === "condition-necessary")
        ?.template,
    ).toBe("[Y] only if [X].");
  });
  it("includes implicit structural moves instead of requiring a transition in every pattern", () => {
    for (const id of ["add", "pivot", "reveal", "emphasis"] as const) {
      expect(
        getRelationship(id).scaffolds.some((item) =>
          item.template.replace(/\[[XY]\]/g, "").match(/^[.\s]+$/u),
        ),
      ).toBe(true);
    }
    expect(
      getRelationship("sequence").connectors.find(
        (item) => item.text === "meanwhile",
      )?.distinction,
    ).toMatch(/overlap/);
  });
  it("returns fresh option lists, leaving the handbook order intact", () => {
    const original = getRelationship("contrast").connectors.map(
      (item) => item.id,
    );
    connectorsFor("contrast", "any").reverse();
    expect(
      getRelationship("contrast").connectors.map((item) => item.id),
    ).toEqual(original);
  });
});

describe("verbatim, heuristic thought segmentation", () => {
  it("splits the cost-and-late-realization rant into meaningful raw clauses", () => {
    const units = segmentRawThoughts(rant);
    expect(units.map((item) => item.text)).toEqual([
      "I liked the tool ",
      "and it did what I needed ",
      "but it was too expensive ",
      "and I didn’t really realize how much I was spending until later.",
    ]);
    expect(units.map((item) => item.text).join("")).toBe(rant);
  });
  it.each([
    "I left because it was late and then I called home.",
    "First sentence. Second sentence! Third question? Last.",
    "\tFirst line\r\n\r\nSecond line\n  Third line\r\n \t",
    "🙂 Café e\u0301lan and I didn’t notice 東京 until later. 🧪 Done!  ",
    "  Alpha but it changed.\n\n ",
    "Ends here.\n\n  ",
  ])("retains contiguous exact UTF-16 offsets and UTF-8 bytes: %s", (raw) => {
    const units = segmentRawThoughts(raw);
    let cursor = 0;
    let byteCursor = 0;
    const bytes = Buffer.from(raw, "utf8");
    for (const unit of units) {
      expect(unit.start).toBe(cursor);
      expect(unit.end).toBeGreaterThan(unit.start);
      expect(unit.text).toBe(raw.slice(unit.start, unit.end));
      expect(unit.id).toBe(`thought-${unit.start}`);
      const byteEnd = Buffer.byteLength(raw.slice(0, unit.end), "utf8");
      expect(Buffer.from(unit.text, "utf8")).toEqual(
        bytes.subarray(byteCursor, byteEnd),
      );
      cursor = unit.end;
      byteCursor = byteEnd;
    }
    expect(cursor).toBe(raw.length);
    expect(byteCursor).toBe(bytes.length);
    expect(
      Buffer.from(units.map((item) => item.text).join(""), "utf8"),
    ).toEqual(bytes);
  });
  it("documents its offset convention through non-BMP and multibyte examples", () => {
    const raw = "🙂é. Next.";
    const units = segmentRawThoughts(raw);
    expect(units.map((item) => [item.start, item.end])).toEqual([
      [0, 5],
      [5, 10],
    ]);
    expect(Buffer.byteLength(units[0].text)).toBe(8);
    expect(units[1].text).toBe("Next.");
  });
  it("finds line, sentence, because, and then, and explicit subject boundaries", () => {
    expect(
      segmentRawThoughts(
        "First.\nSecond because it matters and then we rest and we leave.",
      ).map((item) => item.text),
    ).toEqual([
      "First.\n",
      "Second ",
      "because it matters ",
      "and then we rest ",
      "and we leave.",
    ]);
  });
  it.each([
    "Bread and butter.",
    "small but useful",
    "The candy contains butter.",
    "Dr. Jones paid 3.50 dollars.",
    "An R. Smith example.",
    "A plan and the budget.",
    "This and that.",
  ])("avoids an obvious false clause boundary: %s", (raw) => {
    expect(segmentRawThoughts(raw)).toEqual([
      { id: "thought-0", text: raw, start: 0, end: raw.length },
    ]);
  });
  it("does not turn blank input into invented thoughts", () => {
    expect(segmentRawThoughts("")).toEqual([]);
    expect(segmentRawThoughts(" \t\r\n")).toEqual([]);
  });
  it("is deterministic and preserves the source draft", () => {
    const draft = structureDraftSchema.parse({
      raw: rant,
      thoughtA: "Already chosen A",
      thoughtB: "Already chosen B",
    });
    const before = structuredClone(draft);
    Object.freeze(draft);
    expect(segmentRawThoughts(draft.raw)).toEqual(
      segmentRawThoughts(draft.raw),
    );
    expect(draft).toEqual(before);
  });
});

describe("relationship suggestions are choices, not semantic decisions", () => {
  it("offers contrast, sequence, and reveal for the cost-late-realization case without inventing cause", () => {
    const options = suggestRelationships(
      "I liked the tool and it did what I needed",
      "It was too expensive and I didn’t really realize how much I was spending until later.",
    );
    expect(options.map((item) => item.id)).toEqual([
      "contrast",
      "sequence",
      "reveal",
    ]);
    for (const option of options) {
      expect(option.reason).toMatch(/Heuristic/);
      expect(relationshipIds).toContain(option.id);
      expect(option.reason.length).toBeGreaterThan(60);
    }
    expect(options).not.toHaveProperty("selected");
  });
  it("does not infer cause from mere sequence or the word cost", () => {
    expect(
      suggestRelationships("The price rose.", "I noticed later.").map(
        (item) => item.id,
      ),
    ).toEqual(["sequence", "reveal"]);
    expect(
      suggestRelationships(
        "It cost ten dollars.",
        "It weighed two kilograms.",
      ).map((item) => item.id),
    ).not.toContain("cause");
  });
  it("separates explicit cause and result cues, with a support warning", () => {
    expect(suggestRelationships("X", "because Y")).toEqual([
      expect.objectContaining({
        id: "cause",
        reason: expect.stringMatching(/support/),
      }),
    ]);
    expect(suggestRelationships("X", "therefore Y")).toEqual([
      expect.objectContaining({
        id: "result",
        reason: expect.stringMatching(/supported/),
      }),
    ]);
  });
  it("offers concession, exception, and condition without treating them as proof", () => {
    expect(
      suggestRelationships("Although X", "Y").map((item) => item.id),
    ).toEqual(["concede"]);
    expect(
      suggestRelationships("X", "except Y").map((item) => item.id),
    ).toEqual(["exception"]);
    expect(suggestRelationships("If X", "Y")[0]).toEqual(
      expect.objectContaining({
        id: "condition",
        reason: expect.stringMatching(/not proof/),
      }),
    );
  });
  it("offers questions when no reliable cue exists and leaves the explicit choice intact", () => {
    const draft = Object.freeze({
      ...emptyStructure(),
      relationship: "emphasis" as const,
      thoughtA: "A clear point",
      thoughtB: "A second point",
    });
    const options = suggestRelationships(draft.thoughtA, draft.thoughtB);
    expect(options.map((item) => item.id)).toEqual(["clarify", "add"]);
    expect(options[0].reason).toContain("no reliable surface cue");
    expect(draft.relationship).toBe("emphasis");
  });
});

describe("slot-only preview rendering", () => {
  it("preserves user casing, punctuation, whitespace, and Unicode, even when the result is awkward", () => {
    expect(
      renderScaffold("[X], but [Y].", "  I LIKED it!", "🙂 It’s costly.  "),
    ).toBe("  I LIKED it!, but 🙂 It’s costly.  .");
  });
  it("leaves missing slots visible rather than inventing their values", () => {
    expect(renderScaffold("[X] / [Y] / [Z]")).toBe("[X] / [Y] / [Z]");
    expect(renderScaffold("[X] / [Y] / [Z]", "given")).toBe(
      "given / [Y] / [Z]",
    );
    expect(renderScaffold("[X] / [Y] / [Z]", "", "second")).toBe(
      "[X] / second / [Z]",
    );
    expect(renderScaffold("[X] / [Y] / [Z]", "first", "second", "extra")).toBe(
      "first / second / extra",
    );
  });
  it("replaces repeated supported slots literally without recursively interpreting inserted text", () => {
    expect(renderScaffold("[X] [X] [Y] [Z] [W]", "$& [Y]", "$1", "[X]")).toBe(
      "$& [Y] $& [Y] $1 [X] [W]",
    );
  });
  it("does not silently discard whitespace provided by the writer", () => {
    expect(renderScaffold("[X]|[Y]", " ", "\n")).toBe(" |\n");
  });
  it("does not overwrite raw text, selected thoughts, or units from a rendered preview", () => {
    const units = segmentRawThoughts(rant);
    for (const unit of units) Object.freeze(unit);
    Object.freeze(units);
    const draft = Object.freeze({
      ...emptyStructure(),
      raw: rant,
      units,
      thoughtA: "I liked it.",
      thoughtB: "It cost too much.",
    });
    const before = structuredClone(draft);
    const preview = renderScaffold(
      getRelationship("contrast").scaffolds[0].template,
      draft.thoughtA,
      draft.thoughtB,
    );
    expect(preview).toBe("I liked it., but It cost too much..");
    expect(draft).toEqual(before);
    expect(draft.raw).toBe(rant);
  });
});
