import { describe, expect, it } from "vitest";
import {
  emptyLibrary,
  libraryItemSchema,
  matchesLibraryScope,
  normalizeStyleKey,
  parseStyleDirectives,
  relevantLibraryItems,
  resolveWritingStyle,
  searchLibrary,
  type LibraryContext,
  type LibraryItem,
  type PersonalLibrary,
} from "../packages/domain/src/personal-library";

const stamp = "2026-01-01T00:00:00.000Z";
const item = (id: string, overrides: Partial<LibraryItem> = {}): LibraryItem =>
  libraryItemSchema.parse({
    id,
    kind: "snippet",
    title: id,
    content: `Original wording for ${id}`,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  });
const library = (items: LibraryItem[]): PersonalLibrary => ({
  ...emptyLibrary(),
  items,
});
const hook: LibraryContext = {
  sectionKind: "Hook",
  contentType: "Essay",
  audience: "Builders",
  register: "conversational",
};
const rules = () => [
  item("content-rhythm", {
    kind: "style_rule",
    ruleKey: "rhythm",
    content: "content cadence",
    contentTypes: ["Essay"],
  }),
  item("hook-rhythm", {
    kind: "style_rule",
    ruleKey: "Rhythm",
    content: "section cadence",
    sectionKinds: ["Hook"],
    contentTypes: ["Essay"],
  }),
  item("segue-rhythm", {
    kind: "style_rule",
    ruleKey: "rhythm",
    content: "segue cadence",
    sectionKinds: ["Segue"],
  }),
  item("cl-rhythm", {
    kind: "style_rule",
    ruleKey: "rhythm",
    content: "closing cadence",
    sectionKinds: ["Cl"],
  }),
];

describe("personal-library scope and discovery", () => {
  it("keeps unscoped references available as fallbacks", () => {
    expect(matchesLibraryScope(item("global"), {})).toBe(true);
    expect(matchesLibraryScope(item("global"), hook)).toBe(true);
  });
  it.each(["Segue", "Cl", "Hook extended"])(
    "does not apply a Hook-only item to %s",
    (sectionKind) => {
      const scoped = item("hook", { sectionKinds: ["Hook"] });
      expect(matchesLibraryScope(scoped, { sectionKind })).toBe(false);
    },
  );
  it("matches exact scopes case-insensitively, not by substring", () => {
    const scoped = item("scoped", {
      sectionKinds: ["Hook"],
      contentTypes: ["Essay"],
      audiences: ["Builders"],
      register: "conversational",
    });
    expect(
      matchesLibraryScope(scoped, {
        sectionKind: "hook",
        contentType: "essay",
        audience: "BUILDERS",
        register: "CONVERSATIONAL",
      }),
    ).toBe(true);
    expect(
      matchesLibraryScope(scoped, { ...hook, sectionKind: "Hooklet" }),
    ).toBe(false);
  });
  it.each([
    { sectionKind: "Hook", contentType: "Guide", audience: "Builders" },
    { sectionKind: "Hook", contentType: "Essay", audience: "Readers" },
    { sectionKind: "Cl", contentType: "Essay", audience: "Builders" },
    {},
  ])("requires all configured scope dimensions: %j", (context) => {
    expect(
      matchesLibraryScope(
        item("scoped", {
          sectionKinds: ["Hook"],
          contentTypes: ["Essay"],
          audiences: ["Builders"],
        }),
        context,
      ),
    ).toBe(false);
  });
  it("allows multiple listed alternatives within a scope and honors an explicit register", () => {
    const scoped = item("multi", {
      sectionKinds: ["Hook", "Segue"],
      register: "formal",
    });
    expect(
      matchesLibraryScope(scoped, { sectionKind: "Segue", register: "formal" }),
    ).toBe(true);
    expect(
      matchesLibraryScope(scoped, {
        sectionKind: "Hook",
        register: "conversational",
      }),
    ).toBe(false);
  });
  it("searches custom tags, usage context, notes, effects, and content together", () => {
    const saved = item("my phrase", {
      title: "A phrase",
      content: "The invoice waited.",
      notes: "Save for personal finance",
      tags: ["slow-burn", "billing"],
      effects: ["delayed reveal"],
      sectionKinds: ["Hook"],
      contentTypes: ["Essay"],
      audiences: ["Builders"],
      register: "conversational",
    });
    expect(
      searchLibrary([saved], "slow-burn Hook essay builders reveal"),
    ).toEqual([saved]);
    expect(
      searchLibrary([saved], "invoice finance billing conversational"),
    ).toEqual([saved]);
    expect(searchLibrary([saved], "slow-burn absent")).toEqual([]);
  });
  it("can find stored connectors and patterns without creating a separate preference store", () => {
    const connector = item("but", {
      kind: "connector",
      content: "but",
      tags: ["contrast"],
      preference: "like",
      myLanguage: true,
    });
    const pattern = item("counterpoint", {
      kind: "pattern",
      content: "[X], but [Y].",
      tags: ["contrast"],
      preference: "like",
    });
    const items = [connector, pattern, item("snippet")];
    expect(searchLibrary(items, "contrast", "connector")).toEqual([connector]);
    expect(searchLibrary(items, "contrast", "pattern")).toEqual([pattern]);
    expect(searchLibrary(items, "", "my_language")).toEqual([connector]);
    expect(searchLibrary(items, "", "all")).toEqual(items);
  });
  it("keeps avoided material discoverable in the library rather than hiding it from management", () => {
    const avoided = item("avoid", { preference: "avoid", tags: ["cliché"] });
    expect(searchLibrary([avoided], "cliché")).toEqual([avoided]);
  });
});

describe("deterministic personal-style precedence", () => {
  it("honors current explicit instruction above section notes, section rule, content rule, and global fallback", () => {
    const result = resolveWritingStyle({
      global: { rhythm: "global cadence" },
      library: library(rules()),
      context: hook,
      sectionNotes: "rhythm: notes cadence",
      instruction: "rhythm: current cadence",
    });
    expect(result.effective.rhythm).toEqual({
      value: "current cadence",
      source: "current_instruction",
    });
    expect(result.layers.map((layer) => layer.source)).toEqual([
      "current_instruction",
      "section_notes",
      "section_type",
      "content_type",
      "global",
    ]);
    expect(result.layers.map((layer) => layer.rank)).toEqual([4, 3, 2, 1, 0]);
    expect(
      result.layers.find((layer) => layer.source === "section_type")?.itemIds,
    ).toEqual(["hook-rhythm"]);
  });
  it.each([
    {
      instruction: "",
      sectionNotes: "rhythm: notes cadence",
      items: rules(),
      source: "section_notes",
      value: "notes cadence",
    },
    {
      instruction: "",
      sectionNotes: "",
      items: rules(),
      source: "section_type",
      value: "section cadence",
    },
    {
      instruction: "",
      sectionNotes: "",
      items: rules().filter((rule) => rule.id === "content-rhythm"),
      source: "content_type",
      value: "content cadence",
    },
    {
      instruction: "",
      sectionNotes: "",
      items: [],
      source: "global",
      value: "global cadence",
    },
  ])(
    "falls back correctly to $source when higher-priority explicit values are absent",
    ({ instruction, sectionNotes, items, source, value }) => {
      const result = resolveWritingStyle({
        global: { rhythm: "global cadence" },
        library: library(items),
        context: hook,
        sectionNotes,
        instruction,
      });
      expect(result.effective.rhythm).toEqual({ value, source });
    },
  );
  it("does not leak a Hook style rule into Segue or Cl", () => {
    const saved = library([
      item("hook-only", {
        kind: "style_rule",
        sectionKinds: ["Hook"],
        ruleKey: "rhythm",
        content: "hook cadence",
      }),
    ]);
    for (const sectionKind of ["Segue", "Cl"]) {
      const result = resolveWritingStyle({
        global: { rhythm: "global cadence" },
        library: saved,
        context: { sectionKind },
      });
      expect(result.effective.rhythm).toEqual({
        value: "global cadence",
        source: "global",
      });
      expect(result.layers.flatMap((layer) => layer.itemIds)).toEqual([]);
    }
  });
  it("uses the matching content style for a non-Hook section rather than a Hook-specific rule", () => {
    const saved = library(
      rules().filter((rule) =>
        ["content-rhythm", "hook-rhythm"].includes(rule.id),
      ),
    );
    expect(
      resolveWritingStyle({
        global: { rhythm: "global" },
        library: saved,
        context: { ...hook, sectionKind: "Segue" },
      }).effective.rhythm,
    ).toEqual({ value: "content cadence", source: "content_type" });
  });
  it("keeps nonconflicting lower-priority keys while overriding only explicitly named keys", () => {
    const result = resolveWritingStyle({
      global: {
        rhythm: "global",
        tone: "plain",
        avoidPhrases: ["obviously", "game changer"],
      },
      library: emptyLibrary(),
      context: hook,
      instruction: "rhythm: staccato",
    });
    expect(result.effective.rhythm.value).toBe("staccato");
    expect(result.effective.tone).toEqual({ value: "plain", source: "global" });
    expect(result.effective.avoidphrases.value).toBe("obviously; game changer");
  });
  it("preserves freeform directives in authority order without pretending to parse their meaning", () => {
    const sectionRule = item("freeform", {
      kind: "style_rule",
      sectionKinds: ["Hook"],
      content: "Let this opening breathe; avoid a punchline.",
      notes: "The scene needs time.",
    });
    const result = resolveWritingStyle({
      global: { rhythm: "global cadence" },
      library: library([sectionRule]),
      context: hook,
      sectionNotes: "Make this section slower and warmer.",
      instruction: "Actually, keep it quick and understated.",
    });
    expect(result.layers[0].text).toBe(
      "Actually, keep it quick and understated.",
    );
    expect(result.layers[1].text).toBe("Make this section slower and warmer.");
    expect(result.layers[2].text).toContain(
      "Let this opening breathe; avoid a punchline.",
    );
    expect(result.layers[2].text).toContain("Why: The scene needs time.");
    expect(result.layers.slice(0, 3).map((layer) => layer.values)).toEqual([
      {},
      {},
      {},
    ]);
    expect(result.effective.rhythm).toEqual({
      value: "global cadence",
      source: "global",
    });
    expect(result.effective).not.toHaveProperty("warmth");
  });
  it("normalizes explicit directive keys and leaves ordinary free prose unparsed", () => {
    expect(normalizeStyleKey(" Sentence-Rhythm ")).toBe("sentencerhythm");
    expect(
      parseStyleDirectives(
        "Plain freeform guidance.\n Sentence_Rhythm: long, then short\nTone: plain\nTone: direct",
      ),
    ).toEqual({ sentencerhythm: "long, then short", tone: "direct" });
    expect(
      parseStyleDirectives("Use a lively rhythm but do not hurry."),
    ).toEqual({});
  });
  it("uses deterministic date and ID ordering for otherwise same-scope explicit rules", () => {
    const older = item("a-old", {
      kind: "style_rule",
      ruleKey: "rhythm",
      content: "old",
      contentTypes: ["Essay"],
    });
    const newer = item("b-new", {
      kind: "style_rule",
      ruleKey: "rhythm",
      content: "new",
      contentTypes: ["Essay"],
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    for (const items of [
      [older, newer],
      [newer, older],
    ])
      expect(
        resolveWritingStyle({
          global: {},
          library: library(items),
          context: hook,
        }).effective.rhythm.value,
      ).toBe("new");
  });
  it("keeps avoided rules out of positive style values and returns only applicable avoid references", () => {
    const avoided = item("avoid-hook", {
      kind: "style_rule",
      ruleKey: "rhythm",
      content: "Never this cadence",
      sectionKinds: ["Hook"],
      preference: "avoid",
    });
    const unrelated = item("avoid-cl", {
      sectionKinds: ["Cl"],
      preference: "avoid",
    });
    const result = resolveWritingStyle({
      global: { rhythm: "plain" },
      library: library([avoided, unrelated]),
      context: hook,
    });
    expect(result.effective.rhythm.value).toBe("plain");
    expect(result.avoidedLibraryItems).toEqual([avoided]);
    expect(result.layers.flatMap((layer) => layer.itemIds)).not.toContain(
      avoided.id,
    );
  });
});

describe("relevant references do not become automatic insertions", () => {
  it("returns relevant snippets, connectors and patterns, excluding avoided items and style rules", () => {
    const relevant = item("hook-saved", {
      sectionKinds: ["Hook"],
      preference: "like",
    });
    const connector = item("connector", {
      kind: "connector",
      content: "but",
      sectionKinds: ["Hook"],
    });
    const pattern = item("pattern", {
      kind: "pattern",
      content: "[X], but [Y].",
      sectionKinds: ["Hook"],
    });
    const excluded = [
      item("avoid", { preference: "avoid" }),
      item("segue", { sectionKinds: ["Segue"] }),
      item("style", { kind: "style_rule" }),
    ];
    expect(
      relevantLibraryItems(
        [relevant, connector, pattern, ...excluded],
        hook,
        10,
      )
        .map((saved) => saved.id)
        .sort(),
    ).toEqual(["connector", "hook-saved", "pattern"]);
  });
  it("ranks otherwise equal references lower after repeated use", () => {
    const fresh = item("z-fresh", { sectionKinds: ["Hook"], useCount: 0 });
    const repeated = item("a-used", { sectionKinds: ["Hook"], useCount: 7 });
    expect(
      relevantLibraryItems([repeated, fresh], hook).map((saved) => saved.id),
    ).toEqual(["z-fresh", "a-used"]);
  });
  it("keeps exact section relevance meaningful while respecting suggestion limits", () => {
    const hookItem = item("hook", { sectionKinds: ["Hook"], useCount: 8 });
    const global = item("global");
    expect(relevantLibraryItems([global, hookItem], hook, 1)).toEqual([
      hookItem,
    ]);
    expect(relevantLibraryItems([global, hookItem], hook, 0)).toEqual([]);
  });
  it("breaks score ties deterministically without rewriting the input order", () => {
    const items = [item("z"), item("a")];
    expect(relevantLibraryItems(items, hook).map((saved) => saved.id)).toEqual([
      "a",
      "z",
    ]);
    expect(items.map((saved) => saved.id)).toEqual(["z", "a"]);
  });
  it("offers saved wording as reference, not an instruction, and does not alter use counts or source data", () => {
    const liked = item("liked", {
      content: "A saved sentence, not a command to insert it.",
      preference: "like",
      myLanguage: true,
      sectionKinds: ["Hook"],
      useCount: 2,
    });
    const saved = library([liked]);
    const before = structuredClone(saved);
    Object.freeze(liked);
    Object.freeze(saved.items);
    Object.freeze(saved);
    const references = relevantLibraryItems(saved.items, hook);
    const style = resolveWritingStyle({
      global: { rhythm: "plain" },
      library: saved,
      context: hook,
    });
    expect(references).toEqual([liked]);
    expect(style.layers.map((layer) => layer.text).join("\n")).not.toContain(
      liked.content,
    );
    expect(style.effective).toEqual({
      rhythm: { value: "plain", source: "global" },
    });
    expect(saved).toEqual(before);
    expect(liked.useCount).toBe(2);
    expect(liked.lastUsedAt).toBeNull();
  });
});
