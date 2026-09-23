# Personal Writing Library, scoped style, and Structure

This guide describes the implementation extending protected workbench milestone `266c0d0`. It adds reusable references and an explicit thought-building workflow to the existing workspace; it does not replace Word/Phrase Lens, local workbenches, or the single canonical editor. Setup and backup instructions are in [README.md](../README.md); technical boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Where to start

Open **Personal library** from the workspace controls/menu when you want to browse or edit. **Style guides** opens the guide utility. These are explicitly opened dialogs, not permanent walls of settings. The Inspector's **Save to library**, **From your … library**, **Style for this target**, and **Structure · assemble a thought** start collapsed. Expand only what you need; many open tools can still mean a long scroll. Sources remain a separate modal, not a pinned reference pane.

There are three distinct operations:

1. **Save a reference or preference** to the shared library.
2. **Preview or stage** text for an exact local target in the existing proposal workflow.
3. **Accept/Replace** explicitly to change that target. Saving, copying, previewing, choosing a model, and analyzing do not perform step 3.

The human still owns all claims, examples, sources, and final wording.

## Save language intentionally

Select text or inspect a proposal, expand its save controls, optionally explain **Why keep this?**, and choose a save action. QuickSave preserves the supplied text verbatim; calling it a pattern does not automatically extract variable slots or infer a style principle.

| Stored kind | Intended use |
| --- | --- |
| `snippet` | Exact language worth keeping |
| `pattern` | A reusable construction; edit in `[X]` and `[Y]` slots to use it in Structure |
| `move` | A rhetorical or compositional principle |
| `style_example` | An example of voice or style, not an instruction to reuse its words |
| `style_rule` | An explicitly saved style preference or freeform guide note |
| `connector` | A saved connector reference/favorite/avoid preference |

**Add to Hook Style** (or another section type) saves a `style_example` tagged `style-guide`. It does **not** infer or approve a `style_rule`. **Add to My Language** saves a snippet with `myLanguage: true`; any item can carry this flag in the editor. My Language is a filtered view, not a separate database or seventh item kind.

Use **New library item** or **Edit item** for title, language/principle, notes, section types, content types, custom tags, effects, register, audience labels, reference/like/avoid status, and My Language. Lists accept comma-separated values. Click **Save library item** or **Save changes**; an unsaved form is not an approved preference. Delete requires an explicit confirmation and does not delete document prose.

Candidate saves can retain document/section/run/model provenance. Provenance records origin; it does not certify factual quality or preserve a live link after separate document/library imports.

## Scope and search are different

Automatic context matching uses:

- **OR within each list:** `Hook, Segue` matches either section type.
- **AND between dimensions:** if section, content, audience and register are specified, all must match.
- **Exact, case-insensitive labels:** an audience `engineers` matches `Engineers`, not `senior engineers` or a sentence containing “engineers.” Section/content labels also match exactly rather than fuzzily.
- **Known matching register:** a nonblank register restriction does not match a missing/unknown context register. Blank means unrestricted. The literal `any` used by Structure is a context value; use a blank library register for an unrestricted record, not the word `any`.
- **Empty lists:** no restriction on that dimension.

For example, sections `Hook, Segue`, content `article`, audience `Engineers`, register `technical` requires an article's Hook or Segue addressed exactly to Engineers in technical register. A Hook in narration is not a match. Use multiple explicit audience labels if appropriate, not substrings.

Custom tags are searchable metadata, **not restrictions**. Effects are searchable and provide a small reference-ranking signal, not an additional scope gate. Keyword search checks title, content, notes, register, tags, effects and scope labels; every whitespace-separated query term must appear somewhere. It is not semantic/embedding search. Browsing the whole library is not the same as context-filtered suggestions.

The ordinary contextual reference/style view uses the selected section, document brief, and global Style DNA register. Structure's connector list and model requests use its selected Structure register. Thus their matching sets may differ. A named rule about register is guidance; it does not recursively rerun scope selection under the resulting value.

## References do not insert themselves

**From your … library** shows up to four mechanically ranked references. Rules and avoids are excluded from this list. Section/content-scoped items and effects receive ranking weight; frequent use lowers rank with a capped penalty. This is not evidence that a reference is semantically right for your passage.

- **Copy saved item / Copy item** copies text only and does not mark use.
- **Preview for target** is available for snippets and style examples. It stages the exact saved text as a human-labelled proposal; review it and explicitly Accept/Replace. The target must still be valid.
- Acceptance of a tracked library preview can update `useCount` and `lastUsedAt`. It does not infer all reuse: manual paste, model borrowing, and other routes are not comprehensive usage analytics.
- **Use in builder** loads a pattern's custom template only if it contains both `[X]` and `[Y]`. Fill the slots yourself; loading changes no canonical prose.

A favorite is a reference, not an insertion command. Library metadata can be edited independently of any earlier document copy of the text.

## Write an actual scoped guide

Open **Style guides**, choose **Section type** or **Content type**, choose the desired scope, enter a preference and optional key/reason, then click **Save style rule**. This writes an actual library `style_rule`; there is no duplicate guide-preferences store. Use the main library editor for multi-scope/audience/register metadata or to delete a rule.

Authority, highest first:

```text
current instruction
section notes
matching section-type guide
matching content-type guide
global Style DNA fallback
```

A rule with a section restriction enters the section layer; other matching rules enter the content layer. For the same key within one layer, later update time wins, with stable item ID breaking ties. Keys normalize to lowercase with spaces, hyphens and underscores removed: `sentenceLengths`, `sentence lengths`, and `sentence-lengths` refer to the same named preference.

### Named overrides versus prose

For a concrete conflict, save a content guide with key `rhythm` and value `measured`, then a Hook guide with key `rhythm` and value `clipped`. The Hook resolves to `clipped`. In that Hook's notes, write:

```text
rhythm: flowing
```

Notes win over both guides. A current instruction `rhythm: spare` wins over the notes for that request. **Style for this target → Resolved named preferences** displays effective named values and their source.

In notes/current instructions, a blank `rhythm:` is ignored: it does not erase a lower layer. An explicit directive clears the value:

```text
rhythm: [clear]
```

This produces an empty effective value, not deletion of the saved guide. The special clear handling belongs to the notes/instruction `key: value` parser; do not assume that typing `[clear]` into any arbitrary library content field has the same effect.

Freeform notes such as “keep it relaxed, but precise” remain ordered guidance for provider interpretation. The app does not deterministically understand all natural-language contradictions or guarantee model obedience. A named key resolves which value to supply, not whether the output truly embodies it. There is no automatically learned style-guide GUI and no AI rule auto-approval. To make an observation into a preference, write it and save it explicitly.

Effective phrase-policy keys participate in mechanical exclusions; most other preferences are instructions, not literal phrase bans. Explicit higher-priority style overrides cannot override source fidelity, protected quotes/code, edit boundaries, or excluded Radar terms.

### Provider context has a hard selection limit

The server reloads the **stored library** and derives matching context from the target section and brief plus Structure/Style DNA register. It replaces client-supplied library/resolved-style claims; the browser cannot make a fake library scope authoritative. Single-model, comparison, and legacy injected-provider routes share this enrichment; comparison uses one snapshot for all models.

At most **50 matching items** are supplied: **at most 40 rules/avoid records first** (stable-ID order), then ranked references. Style resolution and connector avoidance for that request use only the selected records. More than 40 applicable rules/avoids can leave some out even before the total reaches 50. The local style display resolves the full local library and can therefore display guidance absent from the provider's bounded set.

**Do not assume every rule in a large personal library is enforced.** This is an item-count cap, not a byte/token cap or a semantic relevance guarantee. Ordinary writing calls still send broader document context; see the README's provider/privacy section before transmitting sensitive work.

## Build a structure from your own thoughts

Structure's built-in notes are original practical writing guidance: **17 relationships, 72 connector entries, 52 scaffolds**. They are not copied book material or a claim of a complete grammar handbook. The relationships are add, contrast, concede, cause, result, example, clarify, qualify, escalate, pivot, return, reveal, compare, condition, sequence, exception, and emphasis.

1. Select a local edit target. Expand **Structure · assemble a thought**.
2. Fill **Thought A** and **Thought B** yourself, or expand **Start from a rant or raw notes**, paste your raw writing, and click **Find thought units**. Use any unit as A or B explicitly; then edit that slot as you wish.
3. Inspect **What might connect these?** if useful. Suggestions explain surface cues, not proven logic. You choose the logical relationship.
4. Choose conversational, formal, technical, sharp, or any register; inspect the relationship's principle/question and choose a scaffold.
5. Optionally adapt the custom template with `[X]`, `[Y]`, `[Z]`, choose an extra-detail job, and supply your own detail.
6. Inspect the filled preview. Copy it, save the construction, or **Stage for target**. Staging creates a human proposal in the existing history pipeline; it does not apply it. Explicit Accept/Replace is still required.

### Raw notes and literal slots

Segmentation uses punctuation, line breaks and limited conjunction/subject cues, with some abbreviation handling. Units are verbatim slices, not paraphrases. Their offsets are JavaScript **UTF-16 indices**, end-exclusive, not UTF-8 byte positions. For nonblank raw input, joining the chunks recovers the original string unchanged, preserving Unicode, whitespace, punctuation and its corresponding encoded bytes; blank-only input yields no units. The separately stored raw original is never rewritten. Quotation, list and nested-clause boundaries can be wrong: these are suggestions, not a semantic parser.

Surface relationship cues do not prove that an event caused another, that a contrast is meaningful, or that a claim is supported. Check both the relationship and its direction yourself.

Scaffolds substitute your exact strings and do not fill facts or missing slots. A template `[X], but [Y].` with A `The software was useful` and B `it was too expensive` previews:

```text
The software was useful, but it was too expensive.
```

If your A already ends in a stop, or B begins with its own connector, those characters remain: duplicated punctuation/connectors may need manual tidying. Casing is not silently normalized. An optional detail is placed at `[Z]`, or appended on a new line if the template has no `[Z]`. Choosing its job does not invent an example or punchline. Unfilled placeholders remain visible, and incomplete previews cannot be staged/tightened. Literal bracket-slot text can also trigger completeness guards; this is not a general-purpose templating language.

Structure drafts, raw notes and run inputs belong to the section workbench and travel with document autosave/export. They are not a second canonical editor.

### Connectors are not interchangeable

Expand **Why these connectors differ**. Technical/formal and conversational options are distinct usage associations; `however`, `but`, and `despite` do not share identical grammar or nuance. **Consider …** records a choice to inspect, not an automatic swap into the current scaffold. Choose/adapt a compatible scaffold rather than replacing words blindly.

**Favorite …** and **Avoid …** save actual `connector` library records with the current register, section type when present, and content type. These are not separate hidden preferences. Matching avoided connectors are hidden by default in this list; **Show avoided connectors** reveals them, and **Unhide** changes the preference back to reference. The main library still lets you inspect/edit/delete these records. Selected scoped avoids also participate in provider proposal checks, subject to the provider-context cap above.

**Save structure** saves the template as a `pattern`. **Save this move** saves the relationship principle as a `move`. Reopen patterns using **Use in builder** once they have `[X]` and `[Y]`; these actions do not generate or apply prose.

### Optional model help

- **Analyze relationship** and **Critique structure** produce analysis, never replacement proposals.
- **Propose a tighter version** requires an explicit request, both human thoughts and a complete preview. It uses action/task `structure` and the existing model chain: one-off → section → section type → task → document → application.
- The preview is the tightening material, not permission to invent facts or fill empty slots. Mechanical policy rejects new word-token occurrences outside that preview, character-length expansion, unresolved slots and changed protected quotes, alongside ordinary target guards. Deletion/reordering still may alter meaning; inspect the result.
- A model response is a proposal only. It cannot approve a rule, save a preference, insert a reference, or change the document automatically. Word/Phrase Lens remains its separate existing targeted workflow, not combined with Structure.

Offline behavior is deterministic guidance/fixtures, not general linguistic intelligence. Live OpenAI and actual Wispr OS-overlay behavior have not been verified here without the necessary credentials/desktop environment.

## Persistence, import, and recovery

The shared library lives in its own SQLite `library` singleton table with its own revision compare-and-swap, separate from documents, Style DNA/settings, and provider catalog. Explicit library changes trigger its serialized save queue. Structure/workbench drafts instead use ordinary document autosave. Watch **both** save states.

| Operation | What it includes / does not do |
| --- | --- |
| Document JSON export | Document, brief/sources, metadata, local workbench and Structure drafts/runs/model choices; **not** the shared global library or global Style DNA/settings |
| **Export library JSON** | All library kinds, guides, connector preferences, scopes/tags/effects, provenance, timestamps and usage metadata; not documents or global settings/provider credentials |
| **Import library JSON** | Validates and appends fresh item IDs; preserves other metadata; never overwrites an existing item. Repeated imports duplicate items, not deduplicate them |
| Full stopped-server data-directory backup | All persisted SQLite data, including documents, library/guides, settings and provider catalog; not browser-only edits or environment credentials |

The library API is `GET /api/library`, `PUT /api/library` (whole-library body with expected `revision`; 409 for stale CAS), and `POST /api/library/import` (body `{ "library": … }`; transactional append). It uses the same local security/body-size boundary as the rest of the API.

On a failed save, local library edits remain in memory: use **Library backup & import → Retry library save** or export them before leaving. A stale revision is not automatically merged across tabs; preserve an export before recovery/reload. The client protects local edits made during its own import from being overwritten, but that is not collaborative merging. Form drafts and failed/unflushed changes have no durable browser crash journal. Global settings still lack revision CAS and can be overwritten by another tab.

The schema permits **5,000 items**, but the **2 MB HTTP request-body limit** can block whole-library saves/imports much earlier. Item limits do not guarantee practical capacity. Long workbench histories also remain a request/context-size risk. No library credentials are stored or exported; keep backend `.env` separate and private.

## Verification boundary

Current library/style/Structure evidence belongs in the separately finalized [LIBRARY-VERIFICATION.md](LIBRARY-VERIFICATION.md). This guide does not assert unconfirmed new test totals. The original protected workbench suite/record remains a distinct historical baseline: [WORKBENCH-VERIFICATION.md](WORKBENCH-VERIFICATION.md), 99 unit/integration and 27 browser tests. The earlier [VERIFICATION.md](VERIFICATION.md) records 60 and 15 for `4f681c6`. Neither historic total certifies the new behavior, live OpenAI output, or live Wispr dictation; see [WISPR-QA.md](WISPR-QA.md) for desktop testing.
