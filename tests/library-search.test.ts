import { describe, expect, it } from "vitest";
import {
  libraryItemSchema,
  searchLibrary,
  type LibraryItem,
} from "../packages/domain/src/personal-library";

const item = (id: string, overrides: Partial<LibraryItem> = {}): LibraryItem =>
  libraryItemSchema.parse({
    id,
    title: id,
    content: "Qué será, será.",
    kind: "snippet",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  });
const entries = [
  item("mine", { kind: "connector", myLanguage: true }),
  item("snippet"),
  item("pattern", { kind: "pattern" }),
  item("example", { kind: "style_example" }),
];
const ids = (items: LibraryItem[]) => items.map((entry) => entry.id);

describe("cross-kind local library discovery", () => {
  it.each([
    "que",
    "sera",
    "que sera",
    "QUÉ SERA",
    "  que—sera!  ",
    "que\u0301 se\u0301ra",
    "ＱＵＥ ＳＥＲＡ",
  ])("finds %s without remembering a category", (query) => {
    expect(ids(searchLibrary(entries, query, "all"))).toEqual(ids(entries));
    expect(ids(searchLibrary(entries, query))).toEqual(ids(entries));
  });
  it("retains explicit kind and My Language filters", () => {
    expect(ids(searchLibrary(entries, "que", "my_language"))).toEqual(["mine"]);
    expect(ids(searchLibrary(entries, "sera", "pattern"))).toEqual(["pattern"]);
    expect(ids(searchLibrary(entries, "que sera", "snippet"))).toEqual([
      "snippet",
    ]);
    expect(searchLibrary(entries, "que", "move")).toEqual([]);
  });
  it("searches tags, effects, register, titles and notes without a provider", () => {
    const metadata = [
      item("tag", { content: "A", tags: ["qué será"] }),
      item("effect", { content: "B", effects: ["resigned acceptance"] }),
      item("register", { content: "C", register: "conversational" }),
      item("title", { content: "D", title: "Qué será" }),
      item("notes", { content: "E", notes: "A quiet callback" }),
    ];
    expect(ids(searchLibrary(metadata, "que sera"))).toEqual(["tag", "title"]);
    expect(ids(searchLibrary(metadata, "accept"))).toEqual(["effect"]);
    expect(ids(searchLibrary(metadata, "convers"))).toEqual(["register"]);
    expect(ids(searchLibrary(metadata, "quiet"))).toEqual(["notes"]);
  });
  it("ranks literal content above literal metadata above one-edit typos", () => {
    const ranked = [
      item("typo", { content: "serra" }),
      item("tag", { content: "unrelated", tags: ["sera"] }),
      item("content", { content: "será" }),
    ];
    expect(ids(searchLibrary(ranked, "sera"))).toEqual([
      "content",
      "tag",
      "typo",
    ]);
    expect(ids(searchLibrary(ranked, "sera", "snippet"))).toEqual([
      "content",
      "tag",
      "typo",
    ]);
  });
  it.each(["sra", "sela", "seraa"])(
    "only permits one insertion, deletion or substitution: %s",
    (content) => {
      expect(searchLibrary([item("near", { content })], "sera")).toHaveLength(
        1,
      );
    },
  );
  it("does not fuzz short terms, allow two edits, or silently drop query terms", () => {
    expect(searchLibrary([item("near", { content: "qua" })], "que")).toEqual(
      [],
    );
    expect(searchLibrary([item("near", { content: "sell" })], "sera")).toEqual(
      [],
    );
    expect(searchLibrary(entries, "que absent")).toEqual([]);
  });
  it("retains substring recall, stable order and non-mutating empty queries", () => {
    const before = structuredClone(entries);
    expect(ids(searchLibrary(entries, "er"))).toEqual(ids(entries));
    expect(ids(searchLibrary(entries, "— !"))).toEqual(ids(entries));
    expect(entries).toEqual(before);
  });
});
