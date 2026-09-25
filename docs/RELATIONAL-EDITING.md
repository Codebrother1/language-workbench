# Timeline / Relational Correction — product and engineering handoff

This is the implemented behavior in the working tree based on `daec692`, not a claim that the base commit alone contains these changes. It extends the same local application, one TipTap/ProseMirror editor, domain model, provider pipeline and SQLite store. Existing fonts and the base color system are retained.

**Verification status:** 343 unit/integration and 71 browser tests, TypeScript, production build and compiled-server restart/security smoke passed. See [RELATIONAL-VERIFICATION.md](RELATIONAL-VERIFICATION.md). No live-provider success is claimed. Historical [WAYFINDING.md](WAYFINDING.md), [SECTION-INSTANCES.md](SECTION-INSTANCES.md), [LIBRARY-VERIFICATION.md](LIBRARY-VERIFICATION.md), [WORKBENCH-VERIFICATION.md](WORKBENCH-VERIFICATION.md), and [VERIFICATION.md](VERIFICATION.md) remain their own records; they do not verify this pass. See [ARCHITECTURE.md](ARCHITECTURE.md) for the broader system and [README.md](../README.md) for operations/backups.

## Launch this repository

The handoff path is `/agent/workspace/language-workbench`. Use **Node 22.17.0 or newer** (built-in `node:sqlite`) and **pnpm 10.34.5**. Node 24 LTS is also supported; a SQLite experimental warning alone is not a startup failure.

```sh
cd /agent/workspace/language-workbench # or the root of your own clone
node --version                      # v22.17.0 or newer
npm install --global pnpm@10.34.5    # only if needed
pnpm --version                      # 10.34.5
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173`; the API is `127.0.0.1:4318`. Alternatively, run `pnpm build && pnpm start` from the same root and open `http://127.0.0.1:4318`. No API key is needed for the labelled deterministic offline provider. An OpenAI key belongs only in backend environment/root `.env`, never browser variables or committed files. This is loopback-only local software, not an authenticated public deployment.

## What the writer sees

### Primary Workbench, one prose editor

Workbench is the default, including for old settings with no saved view. The selected Comfortable card can host the single TipTap editor for direct prose writing; **Edit in preview** and Document View move that same editor back to the assembled page. Unselected card text, the Workbench assembled readout, relational neighbors, and comparison's canonical text are read-only projections of `Document.sections`. The readout is currently plain text; Document View retains rich formatting. There is no second card editor or copied prose state.

`Settings.layout` persists `primaryView` (`workbench` or `document`), `density` (`comfortable` or `overview`), `previewVisible`, and `inspectorVisible`. Defaults are Workbench, Comfortable, both panels visible. Switching to Document makes the prose preview visible. Hide preview gives cards more width; Inspector can also be hidden.

- **Comfortable:** up to seven lines of prose. The selected card exposes its first-class **Storyboard note** in a real growing textarea. Other cards preview notes up to four lines.
- **Overview:** two-line prose and note previews; notes remain available in section options.
- Cards expose role/kind, label, and a model badge when an explicit section override exists. The badge is not a new routing hierarchy.
- Selected-card **Add before / Add after** uses the existing section type picker and stable insertion anchors. Repeated types are valid; position comes from the array, not a unique Hook/Segue/Point slot.
- Storyboard notes and directions are context/drafts, not canonical prose. They remain until explicitly edited; asking for help is not acceptance.

`GrowingTextarea` remains a native `<textarea>`, growing between 100 and 300 px from its content and scrolling internally above that cap. Native input and text selection are preserved. Explicit target highlighting stays visible while the writer moves to controls, with dedicated contrast in both light and dark themes; it is not dependent on the browser retaining a blue selection.

### Focus, directions and accepted versions

The visible target is an explicit writing intention, not whichever input currently has DOM focus. Clicking a section prepares section scope with a collapsed native caret, avoiding an accidental whole-section native replacement selection. An explicit anchor retains that scope/highlight until actual caret movement or a changed section snapshot invalidates it.

- `Document.focusTarget` travels with document save/export. The latest ref is merged by the debounced save pipeline rather than mutating document/editor state recursively inside selection callbacks.
- A valid saved target restores exactly. A stale local range falls back to its surviving section; missing ownership falls back to the first section. There is no search for a similar word elsewhere.
- Section-wide instruction/answer fields remain at the section workbench root. Word/selection drafts live in `workbench.targetDrafts`, keyed by `[scope, start, end, text]`, checked against document/section identity. Revision and the surrounding section snapshot are deliberately not part of the draft key. Another range does not inherit those directions, and they do not overwrite section directions.
- Accept/Replace/Use this version remains explicit. The replacement stays in the assigned section, the new accepted range becomes the target, and a word expanded to multiple words becomes `selection` scope. Inspector/history scroll is restored rather than jumping to a neighbor.
- The coordinator checks both the expected resulting section text and that the editor actually changed before storing the original variant and accepted outcome. A no-change proposal or transaction rejected by the guard is **not** recorded as accepted.

## P0 boundary contract: stable ordered section IDs

`Document.sections` is the sole ordered composition model. Ordinary local text editing cannot create, delete, reorder or rename section identities. The editor's top node contains `writingSection+`; sections contain `block+`. `documentSchema` validates unique, nonempty section IDs. The editor guard independently validates the post-transaction topology; there is **no silent ID repair** to convert unsafe edits into new instances.

| Operation | Contract |
| --- | --- |
| Local typing, delete, formatting or paste | Retain the exact ordered section-ID list. Ordinary native edits from a cross-section selection are rejected. |
| Cross-section selection/copy/navigation | Allowed; read/copy is not write permission. |
| Cross-section typing, deletion, cut or paste | Refused with a message. Use explicit section commands for structural changes. |
| One-section selection including outer wrapper edges | Clamp to that section's inner content; do not consume its wrapper or an empty neighbor. |
| Rich paste containing copied section wrappers | Unwrap clipboard sections to content inside the existing section; pasted IDs do not authorize new instances. |
| Explicit insert/delete/duplicate/reorder/split/merge/load/sync | Use transaction-scoped structural authorization, not an ordinary input bypass. |
| Editor history Undo/Redo | May restore earlier topology, but invalid/missing/duplicate identities are still rejected. History is session-only. |
| Explicit app target replacement | Use local authorization for exactly its assigned section, never topology authorization. |

### Two permissions, not one bypass

`section-boundary.ts::filterTransaction` validates every document-changing result. After validating IDs it permits explicitly structural/history transactions; ordinary transactions must retain exact topology. Native cross-selection changes are blocked. Input/paste/key/`beforeinput`/cut handlers provide earlier protection, with the transaction filter as the backstop.

`authorizedSetContent` parses the proposed editor tree, runs schema checks and validates IDs before marking its one transaction through `allowSectionTopologyChange`. Load resets the editor state/history. Structural synchronization brackets its change with history boundaries, retaining undo. Callers creating new section instances must assign fresh identities.

`allowSectionLocalEdit(tr, sectionId)` is intentionally weaker: it can ignore a current native cross-section selection when applying a previously validated explicit target, but still requires unchanged IDs/order and exact node equality for every nonassigned section. It cannot modify neighbors or topology. Provider acceptance must never receive structural authority.

This is a correctness boundary inside the trusted local application, not a server authorization model for hostile collaborators. Server/domain validation, stale-target checks and database revision CAS remain distinct concerns.

## Segue work: relationships are read context

Select a **Segue** or **Transition** to see previous/current/next context. The records come from the actual ordered section array by active section ID, so repeated kinds/labels do not confuse adjacency. They include role/kind, label, canonical prose and Storyboard notes. Missing neighbors are document edges, not fabricated content.

Neighbors are read-only and have **Select separately**. Selecting one changes the target explicitly. They are not included in the active Segue's edit permission. Add before/after routes to the same existing picker.

An empty Segue is unwritten—not missing source data. Coaching can use supplied notes, instructions, neighbor prose, meaningful brief or sources instead of requiring placeholder prose. The creative flow remains:

1. Select the intended section and explain its job in a Storyboard note.
2. Ask Coach to diagnose the relationship.
3. Answer with the actual connection or wording in your own words.
4. Request proposals; inspect or edit the candidates.
5. Explicitly Accept/Use this version if it belongs in the target.

Canonical text stays unchanged until step 5. No request, model change or candidate inspection is implicit authorship.

### Provider contract and honest offline behavior

`writing-context.ts::relationalContext` derives `previous`, `current`, and `next` from the submitted document. Each non-null record includes section ID/index, role/kind, label, notes and text. `openai-provider.ts` passes this explicit `RELATIONAL_CONTEXT` beside the separate edit target. Policy states that the context is readable, never additional edit authority, and an empty Segue can be diagnosed without inventing a bridge or neighbor facts.

The deterministic mock has a special **empty Segue** branch. It reads the note and neighbor excerpts, explains a connection mechanism, and asks for human bridge lines. Exactly two nonblank answer lines give two human-furnished, trimmed-line verbatim alternatives. Otherwise it considers the supplied wording (with optional `Material:` label removed) plus an available conservative trim. Duplicates and invalid candidates are removed. If there is no distinct safe second candidate, it says so. It does not invent a second bridge to meet a count. Advice scaffolds remain explanatory mechanism text, not filled-in candidate facts. A direction such as “make it warmer” is not actual draft material: do not accept it as prose; supply the wording.

Live OpenAI behavior has **not** been verified here because no live credential was available. Official-SDK/fake-HTTP tests cover payloads and validation, not live account access, output quality or billing. Actual Wispr OS-overlay behavior is also unverified; native textarea/editor support is not a dictation certification. See [WISPR-QA.md](WISPR-QA.md).

## Comparing without silently activating

**Compare Segue versions** opens the existing native wide dialog pattern: previous section above, canonical text plus version columns side by side, next section below. At narrow widths the versions stack. Candidates come from saved variants and the active response; identical provider/model/text entries deduplicate. The default display takes the last three deduplicated candidates; additional choices can be selected when there are more.

Editing a candidate updates the existing proposal/variant metadata only. Copy current/version is nonmutating. **Use this version** delegates to guarded proposal acceptance or variant activation; the canonical column is a read-only projection, not a second editor. Neighbor selection closes the comparison and selects that section separately.

**Known friction:** activating one candidate changes the section snapshot and can invalidate the other alternatives. They still fail closed. There is no automatic rebase or permission to relocate a candidate by similar text. Make a fresh target/request, or copy a candidate and use it manually against a fresh selection. Original text variants are not full rich-format snapshots; whole-section AI replacement rebuilds paragraphs.

## Search and source wayfinding

Personal Library search normalizes NFKD Unicode, case, accents and punctuation. Literal partials such as `que`, `que sera`, and `sera` find matching `Qué será` content across item types. Every token must match content or metadata. Literal content/phrase matches rank above mixed metadata matches; only query tokens of at least four Unicode characters can use bounded edit-distance-one fallback. Equal-ranked results retain input order. This is not embedding/semantic search or unrestricted fuzzy matching.

The selected category/My Language filter is retained. If matching items are outside it, the UI shows the count and **Search all types**; it never silently discards the filter. All-items search includes the existing snippet/pattern/move/style-example/style-rule/connector records, not a new phrase store.

The header **Document sources** control displays the count from `doc.sources` and opens the existing source modal/storage. Find a tool aliases include `source`, `sources`, `reference`, `reference material`, `transcript`, and `paste source`. Source material remains separate from authored prose; it is not yet a pinned reference pane.

**Slash is deferred.** `/` is ordinary text; no slash-command menu is implemented. Cmd/Ctrl+K and Find a tool remain the discovery path. Intercepting slash safely around ordinary typing, composition and dictation needs a separate input-risk review.

## Responsive scope

The Workbench is in-flow, not a fixed overlay or fullscreen drawer. On wide screens card/preview/Inspector columns have bounded scrolling. At <=1180 px Inspector moves below; at <=760 px panels stack. Hiding preview makes the card area wider. Document mode navigation is also in-flow rather than an overlay. This can still produce substantial vertical scrolling; it is not a claim of a finished mobile or drawer-based experience.

## Persistence, compatibility and remaining limits

- Focus and target-local drafts use optional fields in document schema version 1. Older valid records without these fields still parse. Older settings without layout default to Workbench; older binaries are not guaranteed to retain new fields.
- Document export includes the document object's focus and local drafts. Wait for Saved before exporting if the latest change was focus-only: the live target ref is merged into the document on save, while export serializes the document object. Document import/copy remaps their document/section ownership along with existing target/run/variant/history references. Section duplication remaps its own target drafts. It never shares mutable workbench objects with the source.
- Layout preferences live in settings, not document JSON. A stopped-server **full data-directory backup** includes documents, layout/settings, shared library and catalog state. Document and library exports remain separate; credentials and unsaved browser edits are not database backup contents.
- Document focus shares the 700 ms serialized autosave queue. Wait for Saved before closing; failed edits remain only in memory until successful save/export. There is no durable browser crash journal.
- Document/library CAS detects conflicts; it does not merge concurrent tabs. Settings still lack revision CAS. Editor Undo/Redo is not persistent and is not universal undo for metadata/preferences.
- Full document/workbench history is retained and included in read context. The 2 MB request-body limit, growing history, no history compaction, and bounded library context remain practical scale limits.
- Stale alternatives, modal sources, long narrow-layout scroll, one globally busy writing operation, and the large `useWorkspace` coordinator remain known maintenance/UX limits. No external integration, font redesign, microphone service or slash feature is implied.

## Code and verification handoff map

| Files | Responsibility |
| --- | --- |
| `apps/web/src/App.tsx`, `styles.css` | Primary view/density, card notes, sources, responsive layout and target contrast |
| `apps/web/src/RelationalWorkspace.tsx` | Derived neighbor context and explicit candidate comparison |
| `apps/web/src/ui.tsx`, `WritingLabShell.tsx`, `WordLens.tsx` | Native growing directions/answers, existing assistance surfaces |
| `apps/web/src/useWorkspace.ts`, `target-drafts.ts`, `workspace-helpers.ts` | Target refs/save/restore, scoped drafts, request ownership and verified acceptance |
| `apps/web/src/editor.ts`, `section-boundary.ts` | Single editor, position mapping/highlight, topology/local transaction guards |
| `packages/domain/src/index.ts`, `section-operations.ts` | Optional schemas, ID validity and duplicate/remap operations |
| `apps/server/src/repository.ts` | Validated document import/remapping and persistence |
| `apps/server/src/writing-context.ts`, `openai-provider.ts`, `provider-policy.ts`, `mock-provider.ts` | Derived relational payload, policy and deterministic human-material behavior |
| `packages/domain/src/personal-library.ts`, `apps/web/src/PersonalLibrary.tsx` | Normalized literal/one-edit search and explicit cross-category discovery |
| `apps/web/src/commands.ts`, `wayfinding.ts` | Existing source/tool routing, no slash activation |

Regression coverage to preserve includes `section-boundary.test.ts`, `target-drafts.test.ts`, `tests/library-search.test.ts`, `tests/relational-context.test.ts`, and browser `boundaries.spec.ts` / `relational-workbench.spec.ts`, alongside existing editor/provider/repository/legacy UI suites. These filenames describe coverage areas, not proof of a completed run.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` (install Chromium if needed), and `pnpm test:production` from this repository. Build before browser/production checks. The E2E server uses isolated port 4319 and a temporary database; do not confuse it with normal data on 4318. Final commands, totals, failures, screenshots and limitations belong in the separately finalized [RELATIONAL-VERIFICATION.md](RELATIONAL-VERIFICATION.md). Do not overwrite earlier checkpoint evidence with this pass's results.
