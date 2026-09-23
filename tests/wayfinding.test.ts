import { describe, it, expect } from "vitest";
import { commands, searchCommands } from "../apps/web/src/commands";
import { sectionPurposes } from "../apps/web/src/section-purpose";
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
  ] as const) {
    it(`finds ${query} using the same catalog`, () => {
      expect(searchCommands(query)[0].id).toBe(id);
    });
  }
  it("keeps unknown queries empty and the initial view short", () => {
    expect(searchCommands("unfindable-zxq")).toEqual([]);
    expect(searchCommands("")).toHaveLength(7);
  });
  it("preserves every section type and explains its job", () => {
    expect(Object.keys(sectionPurposes).sort()).toEqual(
      [...sectionKinds].sort(),
    );
    for (const kind of sectionKinds) {
      expect(sectionPurposes[kind].purpose.length).toBeGreaterThan(5);
      expect(sectionPurposes[kind].description.length).toBeGreaterThan(10);
      expect(commands.find((c) => c.id === "insert:" + kind)).toBeTruthy();
    }
  });
});
