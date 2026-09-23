import { sectionKinds } from "./domain";
import { sectionPurposes } from "./section-purpose";
export type CommandDefinition = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  group:
    | "Write"
    | "Work on language"
    | "Find your tools"
    | "Add a section"
    | "Document";
};
/** Discovery metadata only. Implementations stay in the existing workspace actions. */
export const commands: CommandDefinition[] = [
  {
    id: "write",
    label: "Keep writing",
    description: "Return the cursor to your page. Type or use Wispr.",
    keywords: ["talk", "type", "thought", "dictation", "canvas", "start"],
    group: "Write",
  },
  {
    id: "paste",
    label: "Paste something to respond to",
    description:
      "Open a source field for a comment, transcript, quote or excerpt.",
    keywords: ["paste", "comment", "reference", "announcement"],
    group: "Write",
  },
  {
    id: "brief",
    label: "What are you making?",
    description:
      "Optional Writing Brief: format, audience, destination and purpose.",
    keywords: [
      "writing brief",
      "content type",
      "reply",
      "narration",
      "article",
      "post",
      "clip commentary",
      "audience",
      "purpose",
    ],
    group: "Write",
  },
  {
    id: "sentence",
    label: "Work this sentence",
    description: "Reveal the existing tools for the sentence at your cursor.",
    keywords: ["sentence", "rewrite", "shorten", "clarify", "coach"],
    group: "Work on language",
  },
  {
    id: "section",
    label: "Work this part",
    description: "Focus the whole current section without changing its words.",
    keywords: ["section", "hook", "point", "segue", "workbench"],
    group: "Work on language",
  },
  {
    id: "word",
    label: "Find another word",
    description:
      "Word/Phrase Lens: select a word or phrase, then explore or replace.",
    keywords: [
      "synonyms",
      "replace word",
      "word lens",
      "phrase lens",
      "thesaurus",
      "meaning",
      "definition",
      "antonym",
      "slang alternatives",
    ],
    group: "Work on language",
  },
  {
    id: "thoughts",
    label: "Break into thoughts",
    description:
      "Bring a copy into the existing thought builder. Your page stays untouched.",
    keywords: ["rant", "raw notes", "organize", "break", "ideas", "assembly"],
    group: "Work on language",
  },
  {
    id: "structure",
    label: "Structure this thought",
    description:
      "Find relationships, sentence scaffolds and the Sentence Builder.",
    keywords: [
      "structure",
      "sentence builder",
      "connect thoughts",
      "concession",
      "contrast",
      "handbook",
    ],
    group: "Work on language",
  },
  {
    id: "sections",
    label: "Turn thoughts into sections",
    description:
      "Open the structure view; place your cursor and split only when you choose.",
    keywords: [
      "organize",
      "sections",
      "split",
      "drag",
      "reorder",
      "arrange",
      "outline",
    ],
    group: "Work on language",
  },
  {
    id: "make-hook",
    label: "Make this a Hook",
    description: "Change this part’s role to Hook. Keep every word as written.",
    keywords: ["opening", "first move", "hook", "convert"],
    group: "Work on language",
  },
  {
    id: "save",
    label: "Save this language",
    description: "Open the existing save choices for the selected passage.",
    keywords: [
      "save this",
      "snippet",
      "pattern",
      "move",
      "style example",
      "my language",
    ],
    group: "Find your tools",
  },
  {
    id: "library",
    label: "Personal Writing Library",
    description: "Browse saved language, patterns, moves and examples.",
    keywords: ["library", "saved", "writing memory"],
    group: "Find your tools",
  },
  {
    id: "library-snippets",
    label: "Find saved snippets",
    description: "Open the Library’s Snippets view.",
    keywords: ["saved snippets", "exact language", "favorites"],
    group: "Find your tools",
  },
  {
    id: "library-patterns",
    label: "Find saved patterns",
    description: "Open the Library’s reusable Patterns view.",
    keywords: ["patterns", "scaffolds", "construction"],
    group: "Find your tools",
  },
  {
    id: "library-moves",
    label: "Find rhetorical moves",
    description: "Open your saved Moves.",
    keywords: ["moves", "rhetoric", "technique"],
    group: "Find your tools",
  },
  {
    id: "library-hooks",
    label: "My hooks",
    description: "Find Hook-scoped items in your existing library.",
    keywords: ["my hooks", "saved hooks", "openings"],
    group: "Find your tools",
  },
  {
    id: "style",
    label: "Style DNA — what sounds like you",
    description:
      "Edit your existing global voice preferences and knowledge packs.",
    keywords: [
      "style dna",
      "voice",
      "global style",
      "knowledge",
      "preferences",
    ],
    group: "Find your tools",
  },
  {
    id: "guides",
    label: "Section and content Style Guides",
    description: "Edit scoped Hook, Segue, Closer or content-type preferences.",
    keywords: [
      "style guide",
      "hook style",
      "segue style",
      "closer style",
      "section style",
      "rules",
    ],
    group: "Find your tools",
  },
  {
    id: "radar",
    label: "Language Radar",
    description:
      "Browse saved language research; refresh when a web-capable provider is configured.",
    keywords: [
      "language radar",
      "slang",
      "culture",
      "current",
      "internet",
      "meme",
    ],
    group: "Find your tools",
  },
  {
    id: "sources",
    label: "Sources — what they actually said",
    description: "Keep reference material separate from your writing.",
    keywords: [
      "source",
      "sources",
      "reference",
      "reference material",
      "transcript",
      "paste source",
      "quote",
      "clip",
      "comment",
    ],
    group: "Find your tools",
  },
  {
    id: "variants",
    label: "Variants for this part",
    description:
      "Find your section’s saved alternatives; nothing activates automatically.",
    keywords: ["variants", "alternatives", "versions", "original"],
    group: "Find your tools",
  },
  {
    id: "history",
    label: "Writing history",
    description: "Open the existing record of proposals and your choices.",
    keywords: ["history", "iterations", "decisions"],
    group: "Find your tools",
  },
  {
    id: "models",
    label: "Change model for this part",
    description: "Reveal model selection, inheritance and Run with.",
    keywords: [
      "change model",
      "model selector",
      "routing",
      "provider",
      "run with",
      "openai",
    ],
    group: "Find your tools",
  },
  {
    id: "compare",
    label: "Compare model approaches",
    description:
      "Open comparison controls. No requests run until you choose Compare.",
    keywords: ["compare models", "model comparison", "brushes"],
    group: "Find your tools",
  },
  {
    id: "providers",
    label: "AI provider settings",
    description: "Manage the existing provider catalog and defaults.",
    keywords: [
      "api",
      "models",
      "provider settings",
      "connection",
      "openrouter",
      "gateway",
    ],
    group: "Find your tools",
  },
  {
    id: "technical",
    label: "Technical writing tools",
    description:
      "Reveal precision and clarity choices for your current target.",
    keywords: [
      "technical writing",
      "jargon",
      "precision",
      "explain",
      "clarity",
    ],
    group: "Work on language",
  },
  {
    id: "critique",
    label: "Whole-piece critique",
    description:
      "Run the existing document analysis; it never rewrites the document.",
    keywords: ["cohesion", "critique", "pacing", "whole document"],
    group: "Work on language",
  },
  {
    id: "copy-document",
    label: "Copy document as plain text",
    description: "Use the existing plain-text copy action.",
    keywords: ["copy document", "copy all", "clipboard", "plain text"],
    group: "Document",
  },
  {
    id: "help",
    label: "What can I do here?",
    description: "Show a few possibilities for the active object.",
    keywords: ["help", "where", "how", "learn", "what can"],
    group: "Find your tools",
  },
  {
    id: "insert",
    label: "What do you want to add next?",
    description: "Open the existing section picker at the current position.",
    keywords: ["insert", "add section", "plus", "structure"],
    group: "Add a section",
  },
  ...sectionKinds.map((kind) => ({
    id: "insert:" + kind,
    label: sectionPurposes[kind].purpose + " — " + kind,
    description: sectionPurposes[kind].description,
    keywords: [
      "add " + kind,
      "insert " + kind,
      kind,
      ...sectionPurposes[kind].purpose.split(" "),
    ],
    group: "Add a section" as const,
  })),
];
export function searchCommands(
  query: string,
  available: CommandDefinition[] = commands,
): CommandDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q)
    return available.filter((c) =>
      [
        "write",
        "brief",
        "word",
        "structure",
        "library",
        "models",
        "help",
      ].includes(c.id),
    );
  const terms = q.split(/\s+/);
  return available
    .map((command, index) => {
      const title = command.label.toLowerCase(),
        aliases = command.keywords.join(" ").toLowerCase(),
        haystack =
          title + " " + aliases + " " + command.description.toLowerCase();
      return {
        command,
        index,
        score: terms.every((t) => haystack.includes(t))
          ? (title.includes(q) ? 8 : 0) +
            (command.keywords.some((k) => k.toLowerCase() === q) ? 12 : 0) +
            terms.reduce(
              (sum, t) =>
                sum + (title.includes(t) ? 3 : aliases.includes(t) ? 2 : 1),
              0,
            )
          : 0,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.command);
}
