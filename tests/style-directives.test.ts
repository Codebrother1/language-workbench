import { describe, it, expect } from "vitest";
import {
  parseStyleDirectives,
  resolveWritingStyle,
  emptyLibrary,
  libraryItemSchema,
  matchesLibraryScope,
} from "../packages/domain/src/index";
describe("explicit style authority edge cases", () => {
  it("ignores blank draft values rather than clearing fallback accidentally", () => {
    expect(parseStyleDirectives("rhythm:   ")).toEqual({});
    expect(
      resolveWritingStyle({
        global: { rhythm: "my cadence" },
        library: emptyLibrary(),
        context: {},
        instruction: "rhythm:   ",
      }).effective.rhythm.value,
    ).toBe("my cadence");
  });
  it("requires an explicit clear marker for intentional clearing", () => {
    expect(parseStyleDirectives("neverSuggest: [clear]")).toEqual({
      neversuggest: "",
    });
  });
  it("does not apply a register-restricted rule when the register is unknown", () => {
    const item = libraryItemSchema.parse({
      id: "rule",
      kind: "style_rule",
      title: "Technical",
      content: "Define the term",
      register: "technical",
      createdAt: "2026-09-23",
      updatedAt: "2026-09-23",
    });
    expect(matchesLibraryScope(item, {})).toBe(false);
    expect(matchesLibraryScope(item, { register: "technical" })).toBe(true);
  });
});
