# Architecture

This describes the implemented local application and its boundaries, not a roadmap presented as finished functionality. The current **Timeline / Relational Correction** pass builds on working-tree base `daec692`; implementation lives in the current tree, not in that base commit alone. Installation and operational commands are in [README.md](../README.md). The current product/engineering handoff is [RELATIONAL-EDITING.md](RELATIONAL-EDITING.md); earlier workflows remain in [WORKBENCHES.md](WORKBENCHES.md) and [PERSONAL-LIBRARY.md](PERSONAL-LIBRARY.md). One editor and the existing workbench ownership model are retained. Current verification is recorded in [RELATIONAL-VERIFICATION.md](RELATIONAL-VERIFICATION.md): 343 unit/integration and 71 browser tests passed, with type checks, build and restart smoke.

## Components and data flow

```text
Browser: React + one TipTap/ProseMirror editor
  App / WritingLabShell / UtilityPanel / RelationalWorkspace (read-only projections)
  ModelControls / ProviderSettings / WordLens / WorkbenchHistory
  PersonalLibrary / LibraryTools / StructureTool (explicit/collapsed tools)
                      |
         useWorkspace + workspace-helpers / library-helpers / target-drafts
         editor + section-boundary (local edits vs explicit topology authority)
                      | same-origin /api requests
                      v
Express application: loopback-only HTTP boundary (app.ts)
       |                                  |
       v                                  v
SQLite Repository                  One ProviderRegistry
  documents JSON + revision          catalog, availability, routing
  singleton settings JSON            writing-context: scope/bound/resolve
  singleton library JSON + revision  one shared OpenAI SDK client
  provider_catalog JSON                      |
                                     LLMProvider interface
                                       |-- MockProvider: conservative/plain
                                       `-- OpenAIProvider: selected model
                                             | structured Responses output
                                             ` separate web-search research

Shared domain: packages/domain/src/
  index.ts      document/workbench schemas, targets, exports, defaults
  routing.ts    model/catalog/lens schemas + sole resolveModel algorithm
  ai-output.ts  common structured response schema
  personal-library.ts  library schema, keyword search, scope/rank/style resolution
  composition.ts / composition-knowledge.ts  Structure schema/helpers/original notes
```

Development uses Vite on `127.0.0.1:5173` with `/api` proxied to `127.0.0.1:4318`. Production serves the Vite build from the same Express server as the API. `config.ts` resolves the repository root from the module path, loads root `.env`, and resolves relative `DATA_DIR` paths against that root rather than the current working directory.

`createApp` accepts an injected repository/provider and optional registry. Normal bootstrap supplies the registry; direct provider injection remains useful for isolated tests. Importing the app does not bind a port, load credentials, or open a database. `index.ts` owns startup and graceful shutdown. `OPENAI_MODEL` uses a centralized environment default.

There is no second writer or provider-specific document persistence path. One registry selects adapters through the same `LLMProvider` contract; OpenAI adapters reuse its shared official SDK client. OpenRouter, Vercel AI Gateway, and custom OpenAI-compatible entries are metadata/settings placeholders, explicitly unimplemented and disabled—not working adapters.

## Canonical domain

The shared domain module is the contract between browser, API, storage, and providers. Important records:

- **Document** (`schemaVersion: 1`): ID, timestamps, revision, brief, ordered sections with unique nonempty IDs, sources, history; optional `focusTarget`, `defaultModel` and document `workbench`.
- **WritingSection:** stable ID, kind/label, rich-node content, notes (presented as Storyboard notes), variants; optional `modelOverride` and `workbench`.
- **SectionWorkbench:** section instruction/answer drafts, optional `targetDrafts` containing exact local target/instruction/answer records, action/controls, lens options, one-off model, comparison choices, runs, `activeRunId`, proposal-state map, and optional `structure` draft. Structure holds raw notes, verbatim units with UTF-16 offsets, A/B/optional slots, relationship, register, connector/scaffold choice, custom template, and optional-detail purpose.
- **WorkbenchRun:** ID/time, captured target/action/instruction/answer/controls/lens, actual model reference, full structured response with routing provenance, and optional Structure request snapshot. Human library/Structure previews use the same run pipeline with a null model and explicit human provider label.
- **EditTarget:** document ID/revision, scope, section ID, text offsets, selected text, and the source section's text snapshot.
- **Variant:** text, original/human/AI origin, label, timestamp, target anchor, and optional model/run references.
- **Iteration:** target, instruction, question, answer, proposal, decision state, provider label, and optional model/run references.
- **PersonalLibrary** (`schemaVersion: 1`): separate singleton revision and at most 5,000 items. Each item has one of `snippet`, `pattern`, `move`, `style_example`, `style_rule`, `connector`; title/content/notes, scope lists, tags/effects/register, reference/like/avoid preference, `myLanguage`, optional named `ruleKey`, timestamps/use count, and optional document/section/run/model provenance. My Language is a flag, not a seventh kind or separate store.
- **Settings:** Style DNA, packs, radar, theme, optional application/type/task routing defaults, and optional `layout` (`primaryView`, `density`, `previewVisible`, `inspectorVisible`). Missing layout defaults to Workbench / Comfortable / preview and Inspector visible. Global settings are not embedded in document export; full database backup includes them.
- **ModelRef/catalog:** provider/model identity, provider implementation/configuration/enablement, model capability knowledge, and cache timestamp.
- **AIRequest / AIResponse:** explicit readable context, edit target, action, stage, controls, and structured diagnosis/questions/findings/lexical results/proposals.

Canonical **prose** is section rich-node content. Drafts/candidates/runs are persisted metadata, not a second canonical text. Each section owns its optional workbench; whole-piece critique/template analysis uses the optional document workbench separately. Persisted `activeRunId` restores the inspected response after reload. Diagnosis-only runs survive even when no proposal/iteration exists.

`workspace-helpers.ts` provides pure workbench read/update, lens classification, run capture/inspection/append, proposal editing, and fork-provenance helpers. Runs get fresh proposal IDs, avoiding collisions across fixtures/models. Successful comparison creates independent runs and saved variants. Human candidate edits update stored candidates/history, not prose.

New workbench/routing fields are optional: older version-1 documents remain readable without destructive conversion. This does not promise that older binaries preserve new fields. Zod parses requests and stored domain records. `schemaVersion: 1` is a format identifier, not a general migration framework. Future schema changes need deliberate migration and round-trip tests; parsing defaults alone should not be treated as a migration plan.

## Editor and state ownership

There is **one rich-text editor**, not a separate editor per section. The custom document node requires `writingSection+`; section nodes contain `block+`, are defining/isolating, and carry section identity/kind/label. Canonical section IDs are nonempty and unique, also enforced by `documentSchema`. There is **no silent ID repair** after input. Workbench cards, excerpts and relational neighbors project canonical sections; they do not own editable copies of prose.

`section-boundary.ts` enforces the P0 invariant: an ordinary local document-changing transaction must retain the exact ordered section-ID list. Invalid identities are rejected even on authorized/history paths. Native cross-section editing is refused with guidance; selection, navigation and copy are allowed. Handlers cover text input, paste, Backspace/Delete, `beforeinput`, and cut; the transaction filter is the backstop. A boundary-wrapped selection overlapping only one section is clamped to its inner content. Rich clipboard `writingSection` wrappers are unwrapped into the existing section instead of minting sections. Actual cross-section selections are never reinterpreted as local targets.

Two distinct transaction-scoped permissions exist; neither is a global bypass window:

- `allowSectionTopologyChange` / `authorizedSetContent`: explicit structural commands and document load/sync may change topology. `authorizedSetContent` parses/checks the editor schema and unique IDs first. Insert/delete/reorder/split/merge use the structural path; native text edits and AI acceptance must not. ProseMirror history Undo/Redo may restore topology, still subject to valid identities. Load resets session history; structural edits retain separate undo boundaries.
- `allowSectionLocalEdit(tr, sectionId)`: explicit app acceptance may ignore a currently unrelated/cross-section native selection. It still requires unchanged ordered IDs and exact equality of every nonassigned section node. It is **not** structural authority.

`editor.ts` converts between canonical section data and the editor tree, maps textual target offsets to ProseMirror positions, and decorates the active target. It does not own persistence. Native editor/textarea input remains the writing path within these boundaries; no speech capture pipeline is installed.

`useWorkspace` is the central coordinator for the active document, document list, editor, target, proposals, save state, preferences, and UI panels. Refs retain current values for asynchronous operations. Rich-editor updates reconstruct section content while a single-document metadata cache retains notes, variants, workbenches and model overrides, including metadata needed when editor undo resurrects a removed section. Loading another document resets that cache and the ProseMirror state/history. Editor undo/redo is session-only, not persisted universal metadata undo.

Focus is a separate persisted editing intention, not permission inferred from DOM focus. `targetRef` changes mark the ordinary 700 ms save queue dirty without nested document/editor mutation inside selection callbacks; `withFocusTarget` merges the latest target at the save boundary. JSON export serializes the current document object, so wait for Saved to include the latest focus-only change. `restoreFocusTarget` validates the exact snapshot, restores a valid target, falls back to the same surviving section for a stale range, or to the first section if its owner is gone. Explicit whole-section focus collapses the native caret while retaining an explicit target/highlight; `explicitAnchor` preserves that intention until native movement or a changed snapshot invalidates it. Word/selection drafts use `target-drafts.ts`: `[scope, start, end, text]` keys under the owning section workbench, with document/section identity checks. Revision and surrounding snapshot are not draft keys. Section instructions/answers remain the workbench root fields; local drafts do not leak into them or into another target.

Acceptance validates the target, builds the exact expected section text, selects the accepted range in the same transaction, and dispatches with local-only authorization. It checks that the editor actually changed and matches the expected text **before** recording original variants or an accepted outcome. A word replaced with multiple words becomes selection scope. Inspector/history scroll is restored; the selected section remains the same. No-op or rejected transactions report an error rather than an accepted record. Other retained alternatives are not automatically rebased after activation and may become stale.

Requests capture the originating target and owner; completion patches the latest document, not a request-time snapshot. Section navigation can continue while a request is pending; late responses stay with the originating section. Removed origins fail closed. Document navigation during a pending run is blocked with an explicit error. One global busy guard prevents simultaneous section operations (one comparison operation can still fan out internally).

Inspecting a run restores its draft/control context and active response, not its prose. Section merge retains old runs but does not fabricate safe new anchors; obsolete snapshots/references fail the usual stale-target checks.

**Maintenance risk:** helpers are modular, but this hook remains large. Editor transactions, metadata restoration, in-memory snapshots, saving, and provider requests are coupled. ProseMirror undo is not a universal undo transaction for every preference or metadata action. Preserve regression coverage for split/merge/reorder, undo/redo, section IDs, notes/variants, asynchronous saves, and document switches before splitting responsibilities into smaller modules.

## Read context is not edit permission

A writing request may include the entire document and preferences as **read context**. A separate **edit target** is the only authorized replacement range.

1. Identify a word, passage, or section target in the editor. Cross-section selections do not become replacement permission.
2. Validate document identity, section existence, the source section snapshot, and the target text/range before asking the provider.
3. Diagnose and ask a question first for creative work. A nonblank human answer is required before creative proposals. Word/spelling actions have limited exceptions.
4. Validate structured output and common provider policy at the API boundary.
5. Present proposals without changing the writing. The user may edit, reject, save as a variant, or explicitly Replace/Accept/Activate. Model changes and run inspection are not activation.
6. On apply/variant activation, validate the target against the **current browser document** again, map it into the current editor, and change only that range. Preserve original target text as an original variant.

Document-wide critique and template analysis are analysis-only; they cannot replace the document. Provider adapters have no persistence capability. `/api/ai` and `/api/ai/compare` return results rather than writing canonical content. Workbench metadata uses the ordinary document autosave path.

The section snapshot check is intentionally conservative: a change elsewhere in the same section can invalidate a target. An unrelated section edit or autosave revision increment need not invalidate an unchanged target. `documentRevision` is recorded for provenance, but target validity is not simply equality with the latest save revision. Database revision CAS is a separate persistence concern.

Stale variants **fail closed** instead of searching for similar text and guessing where it belongs. Original variants are text snapshots, not complete rich-format versions. Section replacement builds paragraphs from text; it can discard local rich formatting.

## Shared library and style authority

The library is global across local documents but separate from Style DNA/settings and canonical document JSON. Scoped guides are actual `style_rule` items, and connector favorites/avoids are `connector` items; there is no parallel guide or connector preference store. `createLibraryItem` saves caller-supplied language/metadata only. QuickSave's **Add to Hook Style** saves `style_example`, never an inferred rule. The scoped-guide form creates/updates a rule only on **Save style rule**. No provider response auto-approves rules, inserts references, or updates library usage.

`matchesLibraryScope` applies OR within section/content/audience lists and AND across those dimensions plus register. Comparisons are exact case-insensitive labels, not substring audience matching. Empty lists/blank register are unrestricted; nonblank register requires known matching context. Tags are searchable metadata, not restrictions; effects participate in simple ranking, not scope restrictions. `searchLibrary` applies NFKD normalization, lowercasing, combining-mark removal and punctuation-to-space normalization to content and metadata. All query tokens must match. Literal substring matches rank first (full normalized content phrase, then content tokens, then mixed/metadata literals); a bounded one-edit token match is allowed only for query tokens of at least four Unicode characters and ranks below literals. Ties retain input order. `que`, `que sera`, and `sera` can match `Qué será`; this is neither semantic retrieval nor unrestricted fuzzy prefix search. Filtering remains explicit; `PersonalLibrary` shows a cross-category match notice and **Search all types** without silently dropping the user's filter.

`relevantLibraryItems` excludes rules and avoids, ranks explicit section/content scope and effects, and penalizes frequent use (a capped use-count penalty). It returns four references by default for the contextual UI. Copying does not mark use. Explicit acceptance of a tracked `human-library` preview calls `markLibraryUsed`; this is not comprehensive detection of manually pasted or model-reused language.

Style authority is independent of model-routing precedence:

```text
current instruction > section notes > matching section-type guide
                    > matching content-type guide > global Style DNA
```

`resolveWritingStyle` sorts matching rules within a layer by update time then ID, so later entries win same-key conflicts. Rules with section scope enter the section layer; other matching rules enter the content layer, even if their section/content lists are empty. Their audience/register restrictions still apply. Named rule keys and `key: value` lines in section notes/current instructions normalize to lowercase with spaces, underscores and hyphens removed. Blank directive values are ignored; an explicit `key: [clear]` sets an empty effective value. The `[clear]` parser is for notes/instruction directives, not arbitrary natural-language inference. Freeform text remains high-to-low ordered guidance for provider interpretation; deterministic named-key resolution is not deterministic natural-language contradiction detection or guaranteed model compliance.

`writing-context.ts::enrichWritingRequest` is the sole server enrichment function, used by registry single runs, comparison, and legacy injected providers in `app.ts`. It replaces client-supplied library/resolved-style claims with context derived from the stored library and submitted document's actual target section, brief content type/audience, and Structure register or Style DNA register. Comparison captures one enriched snapshot for all models. This protects library selection from fabricated client scope/enrichment, not from a local client editing its own submitted document.

External disclosure is bounded to **50 matching items total**: matching rules and avoids are sorted by stable ID and capped at **40**, then mechanically ranked non-rule/non-avoid references fill the remaining allowance. Resolution uses that bounded set. **Applicable rules/avoids beyond this limit are not sent or enforced by this path.** It is not a guarantee of complete large-library style enforcement; local UI resolution can show more than the provider receives. The cap counts items, not bytes/tokens, and does not bound whole-document histories. New writing calls flush pending library changes before requesting enrichment.

Common provider policy uses effective phrase-policy keys (`dislikedPhrases`, `cornyPhrases`, `neverSuggest`), allowing explicit higher-priority overrides/clears without overriding protected source/target boundaries or excluded Radar terms. Selected avoided connector records prevent newly introduced exact phrases using Unicode-aware token boundaries (`so` is not a substring ban on `some`). Other style rules are directives, not literal bans. Semantic correctness remains a review task.

## Structure without a second editor

`composition-knowledge.ts` contains original practical notes for **17 relationships, 72 connector entries, and 52 scaffolds**, not copied book text. Each relationship has a principle, question, connector distinctions and register-associated scaffolds. Technical and conversational choices differ; these are usage associations, not rigid correctness classes. Considering a connector records an inspection choice, not a blind string substitution into a scaffold.

`segmentRawThoughts` uses punctuation, line endings and limited conjunction/subject cues. Units are verbatim `raw.slice(start, end)` chunks with JavaScript **UTF-16 offsets**, end-exclusive, not UTF-8 byte positions. For nonblank input, joining units recovers the raw string unchanged, including Unicode, whitespace and punctuation; raw notes are retained separately and never rewritten. Blank-only input yields no units. Abbreviation/quotation/nested-clause heuristics are incomplete. Relationship suggestions expose surface cues and reasons, never proof of logic, evidence or causality.

The human fills A/B directly or explicitly copies units into slots, chooses relationship/register/scaffold, and optionally supplies `[Z]` plus a detail job (qualifier/example/consequence/aside/punchline/reveal). Custom templates support literal `[X]`, `[Y]`, `[Z]`. `renderScaffold` only substitutes supplied strings; missing slots remain visible. It preserves casing, punctuation, whitespace and replacement-like text, so doubled stops, existing conjunctions or awkward case require human tidying. It supplies no facts. Optional detail is appended on a new line when the template has no `[Z]`.

**Save structure** writes a library `pattern`; **Save this move** writes a `move`. **Use in builder** requires a pattern containing both `[X]` and `[Y]` and loads the custom template without applying text. Favorite/Avoid connector actions write register-, section- and content-scoped library records. Matching avoids are excluded by default in the connector list; **Show avoided connectors** reveals them for inspection/unhiding.

**Stage for target** validates a local target and complete human preview, then `makeHumanRun`/`appendRun` create an ordinary proposal/history entry labelled `human-structure`. It does not apply prose or invoke AI. Explicit Accept/Replace follows the existing stale-target pipeline. Structure state and run inputs autosave inside the owning workbench, not a second editor/store.

Model assistance uses action/task `structure` through the shared one-off → section → section type → task → document → application resolver. Analyze/critique are diagnosis-only regardless of requested stage. Tighten requires explicit propose, both human thoughts and a complete preview; Structure and lexical lens cannot be combined. Policy rejects unresolved placeholders, introduced token occurrences not present in the supplied preview, expansion beyond its character length, and changed protected quotations, in addition to ordinary target/phrase checks. Conservative deletion/reordering is not semantic proof. Neither mock nor live providers gain persistence or automatic acceptance permission.

## Relational context and the primary Workbench

`App.tsx` retains a single `EditorContent`. Workbench adds a wide ordered card projection and an optional prose preview; Document switches layout, not editors. `Settings.layout` persists through the existing settings queue. Comfortable cards clamp prose to seven lines; selected-card Storyboard notes use `GrowingTextarea`, while other notes preview four lines. Overview clamps to two lines. Model badges show explicit section overrides, not a second resolver. Add before/after routes into the existing insertion picker. Edit full prose reveals/focuses the same editor.

`RelationalWorkspace.tsx` derives previous/current/next by the selected section ID and actual array index, never by a unique kind/label assumption. Segue/Transition context shows canonical text, roles and notes. Neighbor content is read-only and offers **Select separately**. The wide comparison dialog places previous context above, canonical/candidate columns in the middle and next context below. Proposal/variant edits update existing metadata; copy is nonmutating; Use this version delegates to existing guarded acceptance. Identical provider/model/text entries deduplicate. Comparison does not autoactivate or rebase stale alternatives.

`writing-context.ts::relationalContext` derives the same adjacency from each submitted document and active target. The OpenAI payload includes explicit `RELATIONAL_CONTEXT` with section ID, index, kind/role, label, notes and text, or null at document edges. Provider policy calls this read context, not expanded edit permission. It treats an empty Segue as unwritten, not missing source data; diagnosis can use notes/neighbors and ask for the real human connection. `canCoachTarget` enables an empty section when supplied instructions, notes, neighbors, meaningful brief or sources provide context; creative proposals still require a human answer.

The mock's special empty-Segue branch is deterministic. It asks for one or two actual bridge lines and quotes read-only neighbor excerpts. Exactly two nonblank human answer lines produce verbatim choices; otherwise it considers supplied wording and a conservative trim, deduplicates and validates. An optional `Material:` prefix is stripped. If no distinct safe second choice exists, it says so rather than inventing one. Advice scaffolds remain mechanism text, not filled candidate prose. No canonical text changes until explicit acceptance.

`GrowingTextarea` is a native textarea with value-driven height clamped to 100–300 px and internal overflow beyond 300 px; it is not a contenteditable substitute or dictation integration. Explicit target decorations persist while controls have focus and have distinct light/dark contrast styles. Fonts and base color tokens remain the existing design. At widths <=1180 px Inspector moves below; <=760 px panels stack in normal flow. Preview hiding widens cards. Workbench is not a fixed/fullscreen drawer; Document navigation is also in-flow rather than an overlay. Long vertical scrolling remains possible.

## Providers and safeguards

`LLMProvider` exposes `run(request)` and `researchCulture(query)` plus capability flags. The registry selects one adapter per resolved model:

- Offline conservative/plain: deterministic fixtures, no network or live research.
- OpenAI Direct: official SDK Responses adapter, structured Zod output with `responses.parse`, `store: false`, timeout, bounded retries. Failures surface without silently changing models or falling back to mock.

Catalog descriptors, enablement and `lastRefreshedAt` persist in SQLite. OpenAI discovery lists model IDs; refresh preserves manual entries and concurrent disable/manual-add changes. A failed refresh retains the cache. Manual OpenAI IDs require no rebuild but do not prove availability. Unknown capabilities remain absent/unknown; unknown structured-output support can be attempted with strict response validation, while explicit unsupported status is rejected. Research requires `webSearch === true`, so newly discovered/manual models with unknown web-search capability cannot research. Known capability metadata is not live account verification.

Keys come only from the backend environment/root `.env`. No credential-write API or browser key-entry UI exists. Status exposes only configuration and the final four characters for keys longer than four characters; shorter keys have no suffix. Catalog persistence contains metadata, not credentials. Placeholder providers remain unimplemented/disabled even when an environment key exists.

OpenAI **Test connection sends an actual tiny Responses request and may charge**. The endpoint accepts an optional model ID; the UI omits it, so the first catalog model is tested. Success is not certification of structured writing/research support.

Enabled knowledge packs and saved/approved radar references are filtered for writing context. Disliked and never-suggest entries participate in exclusion checks. Writing calls have no web-search tool. Research is a separate operation: require web search, collect tool URL citations, then extract structured radar records referencing those exact URLs. New research records are `maybe`, not automatically approved. Verification timestamps are not dates of first usage or proof of present popularity.

`provider-policy.ts` and domain validation enforce mechanically testable restrictions: diagnosis-only boundaries, target/range checks, proposal counts/IDs, known section IDs in findings, word scope, requested word/character counts, forbidden phrases, and preservation of recognizable quoted/backtick/fenced text spans. These checks also run at the API boundary for injected/future adapters.

**Limits:** textual quote/code safeguards are not a semantic verifier or a complete rich-node protection system. They cannot prove that all code, transcript meaning, claims, uncertainty, emotional intent, or source evidence survived unchanged. Source citation membership verifies a URL came from the search result, not that it supports the claim. Human review remains necessary. Editing a proposal manually does not make its claims verified.

Live OpenAI execution has not been tested here without a credential. Tests using the official SDK with a fake HTTP transport cover serialization and response validation, not real provider availability, research quality, latency, or billing.

## Model routing, comparison, and Word/Phrase Lens

`routing.ts::resolveModel` is the sole UI/server precedence algorithm:

```text
one-off Run with > section override > section-type default > task default
                > document default > application preference/environment default
```

Lens requests use task `words` in the same chain. Whole-document analysis has no section override/type. Application/type/task defaults are global preferences; section/document defaults travel with the document. No route grants fallback or edit permission.

The searchable context dropdown shows effective model and route. Run with is consumed by the next dispatched **single-model operation, including diagnosis**; it is not a diagnose-and-propose session override. Failed dispatched requests do not restore it. Compare uses its own explicit list of 2–4 distinct model references, leaving one-off choice untouched.

The compare endpoint clones the same request context per model and executes independently through the registry. Each result is a response or per-model error. Successful results are model-labelled runs and saved variants; no winner is activated automatically. UI feedback is a busy indication, errors and completed history/outcomes—not token streaming or a persistent per-provider progress log. Ordinary recent-output history remains a vertical review. Relational comparison adds the wide canonical/candidate view described above; it is not a general multi-section rewrite canvas. Favorites/recent-model picker UI is absent; run history records actual models.

`isLensTarget` routes word targets and explicit nonempty selections of at most eight words without terminal `.`, `!`, or `?` to Word/Phrase Lens. Whole punctuated sentences remain in Sentence Lab. Server policy separately requires a bounded local single-line lexical target. Explore returns analysis/lexical entries without proposals; Replace may propose without an interview but still cannot apply automatically.

Requests include natural instruction, exact/balanced/loose fidelity, word/phrase/expression shape, intent, persona/register/era, technical precision and document audience. Generated candidates are single-line and shape-checked: one whitespace-delimited token, at most eight tokens, or at most 24 tokens. This is a generation safeguard; humans can manually edit candidate text afterward.

`WordLens.tsx::lexicalPreview` is a pure function using sentence segmentation and an unchanged prefix/suffix around the candidate. It never dispatches an editor transaction or writes persistence. Current/proposed sentence previews and copy do not broaden the narrow target; only explicit Replace applies through stale guards.

Fidelity is a requested constraint, not semantic proof. The mock declines exact-fidelity replacements it cannot guarantee. Its curated “larping” and assumption/inference/conviction entries are not general intelligence, a comprehensive dictionary, historical authenticity or current-web research. Unknown definitions are not invented; repeated Generate more can return the same deterministic fixtures.

### HTTP routes

`apps/server/src/app.ts` defines all endpoints behind the same local security boundary:

| Route | Behavior |
| --- | --- |
| `GET /api/health` | Startup/default provider status |
| `GET/POST /api/documents`, `GET/PUT/DELETE /api/documents/:id` | List/create/read/CAS save/delete |
| `POST /api/import` | Validated identity-remapped document copy |
| `GET /api/library` | Read shared library, including revision |
| `PUT /api/library` | Validate full library body; revision CAS save, 409 on conflict |
| `POST /api/library/import` | Body `{ library }`; validated transactional append with fresh item IDs, 201 response |
| `GET/PUT /api/settings` | Non-secret global preferences, including routing |
| `GET /api/providers` | Sanitized catalog, status and environment default |
| `PATCH /api/providers/:id` | Enable/disable implemented provider; `enabled` only |
| `POST /api/providers/:id/models` | Register OpenAI model ID and optional display name |
| `POST /api/providers/:id/models/refresh` | Refresh/cache model IDs and timestamp |
| `POST /api/providers/:id/test` | Connection test; optional `modelId` |
| `POST /api/ai` | Validated single-model response |
| `POST /api/ai/compare` | 2–4 distinct explicit models; independent outcomes |
| `POST /api/culture/refresh` | Explicit research; optional document/one-off routing context |

## Persistence and concurrency

`Repository` uses synchronous built-in `node:sqlite` with WAL mode and a busy timeout. The current tables are:

```text
documents(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)
settings(id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)
library(id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL, body TEXT NOT NULL)
provider_catalog(id TEXT PRIMARY KEY, body TEXT NOT NULL)
```

The catalog and library tables are added with `CREATE TABLE IF NOT EXISTS`. A document's complete JSON, including optional workbenches and active-run selection, is stored in `body`. A save checks the incoming revision and updates with `WHERE id = ? AND revision = ?`, then increments the revision. A conflict returns HTTP 409 rather than overwriting a newer save. This is compare-and-swap, not real-time collaboration or conflict merging.

The browser debounces changes by 700 ms, serializes saves, and loops if more edits arrived during an in-flight save. It merges the returned revision/timestamp without replacing newer in-memory text. Document navigation attempts to flush pending writes. Failed saves retain the in-memory document and expose an error; export it before reload if necessary.

Library mutations and imports use a separate serialized client queue and independent revision CAS. Full-library PUT validates unique IDs and updates the singleton only at the expected revision. Import uses `BEGIN IMMEDIATE`, appends fresh item IDs, preserves other item metadata, and commits or rolls back as a unit. Client delta helpers preserve edits made while an import is in flight; they are not cross-tab conflict merging. Failed library writes retain local changes and expose **Retry library save** and export; a stale CAS revision can still require recovery/reload after export.

There is a pending-edit before-unload warning but **no durable browser crash-recovery journal**. A browser crash/forced close can lose unflushed edits. Settings use a serialized client queue but server-side singleton settings writes do not have document-style CAS; multiple tabs can still overwrite preferences.

Import validates a document and remaps document/section/source/variant identities, workbench run IDs, proposal/history IDs, active-run selection, proposal-state keys, target/finding references and run links, including `focusTarget` and targets inside `targetDrafts`. Section duplication remaps its target-draft ownership along with other lineage. It is a new copy, not an in-place restore. JSON document export includes focus, target drafts, local workbenches/model defaults, Structure drafts and captured run inputs, but excludes global library/settings/layout/catalog/credentials. These optional additions retain version-1 parsing compatibility; older records without layout use Workbench defaults. Old software is not guaranteed to retain new optional fields. Separate library JSON includes guides, preferences and item metadata; importing appends copies rather than overwriting or restoring the library revision. Library provenance is retained, not a cross-export document remapping guarantee. For a full persisted backup (including the library), stop the server and copy the entire data directory, including any SQLite WAL/SHM files. See the README for recovery precautions.

**Scale limits:** JSON request bodies are capped at 2 MB. Full responses, section snapshots and workbench histories grow the stored document and AI read context. There is no current history compaction or bounded whole-document context policy; large histories can exceed HTTP/provider limits. The single-document metadata cache also has memory cost. The library schema limit is 5,000 items, but full-library PUT/import may hit the 2 MB request-body limit much earlier. The 50-item provider cap is separate and is not a byte/token bound. Archival and bounded document-context selection are future work, not current guarantees.

## Local security and portability

- The process binds to `127.0.0.1` only.
- Host and Origin checks allow loopback hosts; cross-site fetch metadata is rejected. Mutations require `application/json`, including DELETE.
- API responses use `Cache-Control: no-store`; JSON request bodies have a size limit.
- OpenAI credentials exist only on the backend. No browser `VITE_*` key or proprietary hosting dependency is required.
- There is **no authentication, encrypted database, multi-user isolation, or hardened public-server deployment model**. Loopback restrictions do not protect against arbitrary local processes or compromised trusted local applications.

A future browser extension should be a thin client to the local API with minimal permissions. No extension UI/manifest is implemented. Existing Host/Origin restrictions do not constitute extension authorization: extension origins would need explicit, narrowly scoped support, pairing/authentication, and a threat-model review rather than a broad CORS exception.

## UI scope and verification boundary

The current UI exposes the brief, sources, section metadata, variants, history, Style DNA/packs, and radar alongside core writing/proposal flows. Sources are modal rather than a pinned side-by-side reference. Utilities use one-window dialogs. Library and guide dialogs open only explicitly; new Inspector tools start collapsed, although opening several produces a long scroll. There is no automatically learned style-guide GUI, semantic embedding search, or automatic rule approval. Broad action/schema coverage is not evidence that every deep rhetorical mode has a complete dedicated UI.

Verification is layered: domain/editor tests, repository/API tests, provider transport/policy tests, Chromium E2E, and a real built-server restart smoke check. Current Timeline / Relational Correction results are verified in [RELATIONAL-VERIFICATION.md](RELATIONAL-VERIFICATION.md): 343 unit/integration and 71 browser tests passed. Existing tests and historical verification records remain separate. [LIBRARY-VERIFICATION.md](LIBRARY-VERIFICATION.md), [SECTION-INSTANCES.md](SECTION-INSTANCES.md), and [WAYFINDING.md](WAYFINDING.md) document their own earlier checkpoints. The unchanged historical [WORKBENCH-VERIFICATION.md](WORKBENCH-VERIFICATION.md) records milestone `266c0d0` (99 unit/integration and 27 browser tests), and [VERIFICATION.md](VERIFICATION.md) records original baseline `4f681c6` (60 and 15). These records stay separate; historical counts do not verify new code. The workbench smoke covers model/local-history/routing/catalog persistence across an actual restart and synthetic-key absence from static JS/HTTP responses without live provider requests. Live OpenAI and Wispr have no credential/desktop verification here. Chromium-on-Linux input/clipboard checks are not a live Wispr OS-overlay test; see [WISPR-QA.md](WISPR-QA.md).


## Unrestricted section instances

`Document.sections` remains the sole ordered composition model. Types configure behavior, not unique slots or counts. New pure operations in `packages/domain/src/section-operations.ts` provide stable-anchor insertion, deep independent duplication with remapped lineage, and removal. New instances use existing model/style resolution, editor/history, variants, scope validation and SQLite persistence. The editor retains one empty Freeform caret container after the last removal; no semantic type is required.

`SectionInsertion.tsx` provides one shared type picker and input-safe sibling gutter overlay. Controls never live in contenteditable or clipboard output. Anchors use document and neighboring section IDs and fail if stale. Structural transactions get their own undo boundaries. See `SECTION-INSTANCES.md` for tested cases and limitations; future templates may seed an initial array but must not enforce it.


## Wayfinding is a routing layer, not a parallel application

The first-use pass adds no domain schema or backend endpoint. `commands.ts` defines a searchable metadata catalog. `useWayfinding` owns only ephemeral palette, library-filter and tool-disclosure intents; it delegates to existing workspace actions. `CommandPalette` closes its native dialog before dispatching, so typing cannot fall into a closing search field. `FirstMove` overlays guidance outside contenteditable; `NextSteps` and contextual help route the same actions. The native canvas remains immediately usable without setup.

Existing insertion and source-add implementations are shared by old buttons and new entry points. Library routes pass initial query/view into the existing library. Tool routes expand/scroll existing Inspector sections after render; they do not create parallel editors, AI clients, features, or persistent writing state. Cmd/Ctrl+K is the only reserved new shortcut and is ignored during composition; slash remains ordinary writing.

A small `clipboardPlainText` serializer removes wrapper-generated leading breaks from native copy while preserving authored whitespace and block boundaries. The relational pass adds the explicit boundary handlers described above: cross-section cut/paste/edit is blocked, copy remains native, and pasted rich section wrappers become inner content. Slash commands are **deferred**, not implemented; changing `/` into command activation remains an input/IME/dictation risk requiring separate review. Cmd/Ctrl+K and Find a tool remain the supported discovery routes. The header Document sources count and source/reference/transcript/paste-source aliases delegate to existing source storage/modal. See `WAYFINDING.md` for the earlier first-use checkpoint and `RELATIONAL-EDITING.md` for the current contract.
