import { z } from "zod";
export const libraryKinds = [
  "snippet",
  "pattern",
  "move",
  "style_example",
  "style_rule",
  "connector",
] as const;
export const libraryItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(libraryKinds),
  title: z.string().max(240),
  content: z.string().max(50000),
  notes: z.string().default(""),
  sectionKinds: z.array(z.string()).default([]),
  contentTypes: z.array(z.string()).default([]),
  audiences: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  effects: z.array(z.string()).default([]),
  register: z.string().default(""),
  preference: z.enum(["like", "avoid", "reference"]).default("reference"),
  myLanguage: z.boolean().default(false),
  ruleKey: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastUsedAt: z.string().nullable().default(null),
  useCount: z.number().int().min(0).default(0),
  provenance: z
    .object({
      documentId: z.string().optional(),
      sectionId: z.string().optional(),
      runId: z.string().optional(),
      model: z
        .object({ providerId: z.string(), modelId: z.string() })
        .optional(),
    })
    .optional(),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export const personalLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().min(0),
  items: z.array(libraryItemSchema).max(5000),
});
export type PersonalLibrary = z.infer<typeof personalLibrarySchema>;
export const emptyLibrary = (): PersonalLibrary => ({
  schemaVersion: 1,
  revision: 0,
  items: [],
});
export type LibraryContext = {
  sectionKind?: string;
  contentType?: string;
  audience?: string;
  register?: string;
};
export function matchesLibraryScope(
  item: LibraryItem,
  context: LibraryContext,
): boolean {
  const matches = (list: string[], value?: string) =>
    !list.length ||
    Boolean(value && list.some((x) => x.toLowerCase() === value.toLowerCase()));
  return (
    matches(item.sectionKinds, context.sectionKind) &&
    matches(item.contentTypes, context.contentType) &&
    matches(item.audiences, context.audience) &&
    (!item.register ||
      Boolean(
        context.register &&
        item.register.toLowerCase() === context.register.toLowerCase(),
      ))
  );
}
export function searchLibrary(
  items: LibraryItem[],
  query: string,
  kind?: string,
): LibraryItem[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(
    (i) =>
      (!kind ||
        kind === "all" ||
        (kind === "my_language" ? i.myLanguage : i.kind === kind)) &&
      terms.every((t) =>
        [
          i.title,
          i.content,
          i.notes,
          i.register,
          ...i.tags,
          ...i.effects,
          ...i.sectionKinds,
          ...i.contentTypes,
          ...i.audiences,
        ]
          .join(" ")
          .toLowerCase()
          .includes(t),
      ),
  );
}
/** Likes are references, never insertion commands. Repeated use lowers suggestion rank. */
export function relevantLibraryItems(
  items: LibraryItem[],
  context: LibraryContext,
  limit = 4,
): LibraryItem[] {
  return items
    .filter(
      (i) =>
        i.kind !== "style_rule" &&
        i.preference !== "avoid" &&
        matchesLibraryScope(i, context),
    )
    .map((item) => ({
      item,
      score:
        (item.sectionKinds.length ? 6 : 0) +
        (item.contentTypes.length ? 3 : 0) +
        (item.effects.length ? 1 : 0) -
        Math.min(item.useCount, 8) * 0.5,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.updatedAt.localeCompare(a.item.updatedAt) ||
        a.item.id.localeCompare(b.item.id),
    )
    .slice(0, limit)
    .map((x) => x.item);
}
export type StyleLayer = {
  source:
    | "global"
    | "content_type"
    | "section_type"
    | "section_notes"
    | "current_instruction";
  rank: number;
  text: string;
  values: Record<string, string>;
  itemIds: string[];
};
export type ResolvedWritingStyle = {
  layers: StyleLayer[];
  effective: Record<
    string,
    { value: string; source: StyleLayer["source"]; itemId?: string }
  >;
  avoidedLibraryItems: LibraryItem[];
};
/** Explicit key: value lines resolve deterministically. Free prose remains an ordered directive,
 * not pretend NLP. The provider receives the same high-to-low authority order. */
export function parseStyleDirectives(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([\w .-]{1,60}):\s*(.+)\s*$/u);
    if (match && match[2].trim())
      values[normalizeStyleKey(match[1])] =
        match[2].trim() === "[clear]" ? "" : match[2].trim();
  }
  return values;
}
export function normalizeStyleKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}
export function resolveWritingStyle(input: {
  global: Record<string, unknown>;
  library: PersonalLibrary;
  context: LibraryContext;
  sectionNotes?: string;
  instruction?: string;
}): ResolvedWritingStyle {
  const applicable = input.library.items.filter(
    (i) =>
      i.kind === "style_rule" &&
      i.preference !== "avoid" &&
      matchesLibraryScope(i, input.context),
  );
  const byScope = (section: boolean) =>
    applicable
      .filter((i) => Boolean(i.sectionKinds.length) === section)
      .sort(
        (a, b) =>
          a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
      );
  const ruleLayer = (
    source: "content_type" | "section_type",
    rank: number,
    items: LibraryItem[],
  ): StyleLayer => ({
    source,
    rank,
    text: items
      .map((i) => i.content + (i.notes ? "\nWhy: " + i.notes : ""))
      .join("\n"),
    values: Object.fromEntries(
      items
        .filter((i) => i.ruleKey.trim())
        .map((i) => [normalizeStyleKey(i.ruleKey), i.content]),
    ),
    itemIds: items.map((i) => i.id),
  });
  const layers: StyleLayer[] = [
    {
      source: "global",
      rank: 0,
      text: "Global Style DNA fallback",
      values: Object.fromEntries(
        Object.entries(input.global).map(([k, v]) => [
          normalizeStyleKey(k),
          Array.isArray(v) ? v.join("; ") : String(v),
        ]),
      ),
      itemIds: [],
    },
    ruleLayer("content_type", 1, byScope(false)),
    ruleLayer("section_type", 2, byScope(true)),
    {
      source: "section_notes",
      rank: 3,
      text: input.sectionNotes ?? "",
      values: parseStyleDirectives(input.sectionNotes ?? ""),
      itemIds: [],
    },
    {
      source: "current_instruction",
      rank: 4,
      text: input.instruction ?? "",
      values: parseStyleDirectives(input.instruction ?? ""),
      itemIds: [],
    },
  ];
  const effective: ResolvedWritingStyle["effective"] = {};
  for (const l of layers)
    for (const [key, value] of Object.entries(l.values))
      effective[key] = { value, source: l.source };
  return {
    layers: layers.slice().reverse(),
    effective,
    avoidedLibraryItems: input.library.items.filter(
      (i) => i.preference === "avoid" && matchesLibraryScope(i, input.context),
    ),
  };
}

export const resolvedWritingStyleSchema = z.object({
  layers: z.array(
    z.object({
      source: z.enum([
        "global",
        "content_type",
        "section_type",
        "section_notes",
        "current_instruction",
      ]),
      rank: z.number(),
      text: z.string(),
      values: z.record(z.string()),
      itemIds: z.array(z.string()),
    }),
  ),
  effective: z.record(
    z.object({
      value: z.string(),
      source: z.enum([
        "global",
        "content_type",
        "section_type",
        "section_notes",
        "current_instruction",
      ]),
      itemId: z.string().optional(),
    }),
  ),
  avoidedLibraryItems: z.array(libraryItemSchema),
});
