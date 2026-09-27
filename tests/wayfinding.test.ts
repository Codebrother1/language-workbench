import { describe, it, expect } from "vitest";
import { commands, searchCommands } from "../apps/web/src/commands";
import { sectionConcepts } from "../apps/web/src/section-purpose";
import { sectionKinds } from "../packages/domain/src/index";
describe("one discovery catalog over existing capabilities", () => {
  it("has unique command IDs and no command-local document or provider implementations", () => {
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
    for (const c of commands) {
      expect(Object.keys(c).sort()).toEqual([
        "description",
        "group",
        "id",
        "keywords",
        "label",
      ]);
      expect(c.description.length).toBeGreaterThan(15);
    }
  });
  for (const [query, id] of [
    ["synonyms", "word"],
    ["replace word", "word"],
    ["tone", "sentence"],
    ["funnier", "sentence"],
    ["voice", "style"],
    ["register", "sentence"],
    ["metaphor", "sentence"],
    ["figurative", "sentence"],
    ["reference", "sources"],
    ["swap", "word"],
    ["rewrite", "sentence"],
    ["audience", "brief"],
    ["style", "style"],
    ["punctuation", "delivery"],
    ["pause", "delivery"],
    ["rhythm", "delivery"],
    ["cadence", "delivery"],
    ["ellipsis", "delivery"],
    ["semicolon", "delivery"],
    ["capitalization", "delivery"],
    ["save this", "save"],
    ["my hooks", "library-hooks"],
    ["add segue", "insert:Segue"],
    ["closer", "insert:Closer"],
    ["style guide", "guides"],
    ["writing brief", "brief"],
    ["change model", "models"],
    ["language radar", "radar"],
    ["slang", "radar"],
    ["structure", "structure"],
    ["technical writing", "technical"],
    ["copy document", "copy-document"],
    ["source", "sources"],
    ["variants", "variants"],
    ["take", "variants"],
    ["takes", "variants"],
    ["version", "variants"],
    ["alternate version", "variants"],
    ["save version", "variants"],
    ["save take", "variants"],
    ["keep this version", "variants"],
  ] as const) {
    it(`finds ${query} using the same catalog`, () => {
      expect(searchCommands(query)[0].id).toBe(id);
    });
  }
  it("ranks exact take intent ahead of incidental stakes substrings", () => {
    const results = searchCommands("take");
    expect(results[0].id).toBe("variants");
    expect(results.findIndex((item) => item.id === "variants")).toBeLessThan(
      results.findIndex((item) => item.label.toLowerCase().includes("stakes")) <
        0
        ? results.length
        : results.findIndex((item) =>
            item.label.toLowerCase().includes("stakes"),
          ),
    );
  });
  it("keeps unknown queries empty and the initial view short", () => {
    expect(searchCommands("unfindable-zxq")).toEqual([]);
    expect(searchCommands("")).toHaveLength(7);
  });
  it("preserves every section type and explains its job", () => {
    expect(Object.keys(sectionConcepts).sort()).toEqual(
      [...sectionKinds].sort(),
    );
    for (const kind of sectionKinds) {
      const concept = sectionConcepts[kind];
      expect(concept.name).toBe(kind);
      expect(concept.rhetoricalJob.length).toBeGreaterThan(5);
      expect(concept.shortDescription.length).toBeGreaterThan(10);
      expect(concept.whenToUse.length).toBeGreaterThan(10);
      expect(concept.category.length).toBeGreaterThan(3);
      expect([
        "Opening",
        "Development",
        "Connection",
        "Turn",
        "Ending",
        "Flexible",
      ]).toContain(concept.category);
      expect(commands.find((c) => c.id === "insert:" + kind)).toBeTruthy();
    }
    expect(sectionConcepts.Segue.shortDescription).toContain(
      "Connects one idea",
    );
    expect(sectionConcepts.Reveal.whenToUse).toContain("tension");
    expect(sectionConcepts.Callback.shortDescription).toContain(
      "earlier phrase",
    );
    expect(sectionConcepts.Evidence.shortDescription).toContain("data, quote");
  });
});
