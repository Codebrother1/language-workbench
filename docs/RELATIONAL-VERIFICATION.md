# Timeline / relational correction — verification record

2026-09-23. Built on protected baseline **daec692**, without replacing `Document.sections`, introducing another editor, or adding a second canonical writing store. The exact checkpoint is the commit containing this record (`git log -1`).

## Results

| Check | Result |
|---|---|
| TypeScript: domain, API, web | Passed |
| Unit/integration tests | **343 passed**, 20 files |
| Browser tests | **71 passed** across all seven suites |
| Production build | Passed |
| Real compiled-server restart/security smoke | Passed, extended for layout/focus/directions |
| Previous regression tests | All 291 unit/integration and 58 browser tests retained unchanged |

The browser suites were run in non-overlapping batches to stay below the execution environment's per-command time limit: first-use + editor (28), library + section insertion + workbenches (30), and boundaries + relational workflow (13). An initial overlong combined run was terminated by the environment; its isolated test server was identified and stopped before the successful batch runs. No test retries, deleted assertions, or weakening of old coverage were used to obtain these results.

Environment: Node 24.14.1, pnpm 10.34.5, real Chromium 153 driven by Playwright on Linux. Production app build: approximately 901 kB main JS / 277 kB gzip (non-failing Vite size advisory). Node emits the known SQLite experimental warning. One unit fixture deliberately constructs a ProseMirror outer edge and emits its expected non-inline endpoint warning.

## P0: exact boundary fix

`SectionBoundaryGuard` checks every document-changing editor transaction. Ordinary local editing must retain the same ordered, nonempty, unique section IDs. Identity, count or order changes are refused rather than repaired with new IDs.

Permission paths are explicit:

- `authorizedSetContent` tags application structural transactions, including document loads and existing insert/delete/duplicate/reorder/split/merge commands. Genuine editor history undo/redo is recognized by the history library.
- `allowSectionLocalEdit` permits an application-owned local replacement even if the native browser selection is elsewhere, but still requires identical topology and unchanged neighboring section nodes.
- Native local edge selections are clamped to the selected section's editable content. Rich pasted section wrappers are treated as content inside that section, not new semantic instances.
- Backspace/Delete at a section edge cannot consume the neighboring section.
- Cross-section text-changing selection/cut/paste operations fail closed with guidance. Cross-section copy and selection still work. This conservative behavior is intentional; use local edits or explicit structural operations instead.

`Document.sections` remains the canonical ordered model. Unique identities are now validated before saving/importing ambiguous data. There is no `point1`/`point2` structure and no semantic count/order restriction.

Seven browser boundary regressions use six stable section IDs, including **Segue immediately before Reveal**. They check keyboard replacement of Reveal's first sentence, the preceding Segue's last sentence, rich paste from an outer structural edge, first-word Word Lens acceptance, first-sentence AI acceptance, empty-section edge deletion, punctuation at the boundary, cross-section editing refusal, copy, and undo/redo. Neighbor content and all IDs/order are compared before/after and after reload.

This prevents new accidental merges. It does not reconstruct already merged historical data or guess missing section identities; use existing backups/history or explicit repair for such data.

## Workbench, views and cards

Workbench is the default primary view. `Settings.layout` persists the chosen primary view, Comfortable/Overview density, preview visibility and Inspector visibility through the existing local settings store. Document View remains the same assembled rich-text editor for reading, refinement and copy/export.

Cards are projections of canonical sections, not independent editable prose stores. Comfortable shows a meaningful multiline excerpt, role, optional model override, storyboard note and essential controls. The selected comfortable card exposes its ordinary growing note textarea. Overview compresses prose/notes. Add before/after reuses the stable-anchor insertion picker. Selecting a card restores its section target and exposes the corresponding full prose/relational context in the single editor/preview area.

At narrow desktop widths, the Workbench remains in document flow, not a fixed overlay. Preview can be collapsed for full-width cards; otherwise it stays alongside where space permits, with Inspector below. Very narrow widths stack the surfaces. This prioritizes the Workbench without covering the secondary preview.

## Segue workflow and compare

A selected Segue/Transition derives previous/current/next context from the actual ordered section array. Neighbor role, prose and note are displayed read-only; selecting a neighbor separately is explicit. The current Segue remains the sole edit target.

An empty Segue can be coached from its role, note, brief, sources, direction and neighbors. The real-provider request includes explicit `RELATIONAL_CONTEXT` under read context. Diagnosis asks a useful question rather than requiring pre-existing prose. Offline proposals are honestly human-grounded: two supplied human lines, or verbatim plus a conservative trim when distinct. No fabricated second option is invented merely to meet a count.

The wide comparison workspace keeps Previous above, Next below, and canonical/candidate versions side-by-side on desktop. Candidates are editable and copyable; Use this version is explicit. Duplicate presentation of the same model/text is removed. Neighbors are never passed as replacement ranges. Inline errors remain visible inside the comparison dialog.

Acceptance/activation verifies that the intended text was actually applied before recording an accepted outcome or original variant. Its transaction explicitly retains the replacement range inside the same section; the Inspector/section selection does not advance. Stored history, variants and model provenance remain intact.

Stale alternatives still fail closed. After one version changes the canonical snapshot, another candidate based on the old snapshot may require a fresh request or explicit manual reuse; automatic rebasing was not introduced.

## Directions, focus and highlights

- Section directions remain in the section workbench.
- Word/phrase/sentence drafts are keyed by scope, offsets and exact text within that owner. Different targets show their own saved direction/answer or a clean field.
- Proposal answers remain attached to their response target. Ask About Candidate writes/reads the original target's draft, not a newly moved cursor's draft.
- `Document.focusTarget` persists exact local focus through the existing document save queue. Valid snapshots restore; stale local targets fall back to the matching whole section instead of guessing an offset.
- Explicit section focus uses a collapsed caret with a separate target decoration; reloading does not select the entire section for accidental replacement.
- An explicit-anchor guard prevents delayed browser selection events from replacing a chosen section target. Word-to-phrase replacements are reclassified for Phrase Lens.
- Native direction/material textareas grow from approximately 100px to 300px and then scroll.
- The persistent ProseMirror target decoration remains visible when the Inspector owns focus, with stronger but readable light/dark contrast.

Focus and target-specific drafts are remapped during document/section copying and import. Focus-only changes should reach Saved before exporting the latest focus metadata. Editor undo remains session-local, not a persisted universal history.

## Search, Sources, slash status

Saved library search normalizes case, Unicode accents, punctuation and whitespace; matches useful literal/partial tokens in content and metadata; and offers a lightweight one-edit fallback for terms of at least four characters. Tests find `que sera sera` via `que sera`, `sera`, and `que`, irrespective of storage kind in All view. Explicit category filters remain; Search all types reveals matches outside the current category without silently changing it.

A header-level **Sources · count** opens the existing document source store. Command aliases include source, sources, reference, reference material, transcript and paste source.

Slash triggers are **deferred**. This pass hardens native editing boundaries and does not add a competing input hook. `/` remains normal prose; Cmd/Ctrl+K continues routing to the same tools. No speech recognizer was added.

## Requested workflow exercised

The new browser workflow creates a Segue first, keeps its canonical prose empty, supplies a storyboard note, inserts Point before and Reveal after, writes their text, coaches the empty Segue, supplies two human variants, compares with both neighbors visible, activates one, and checks that the active section remains Segue. It then changes the Reveal's first sentence in Document View, checks topology, undoes/redoes, returns to Workbench, reloads, and confirms mode, target and local material.

Additional flows verify saved-variant activation, two independent sentence directions, comfortable notes/model badges, Overview persistence, 900px layout without primary-overlay obstruction, preview collapse, partial/fuzzy phrase lookup across categories, document Sources/aliases, growing instructions and dark-mode persistent highlights. Screenshots are actual running fixtures: `relational-workbench.png`, `relational-compare.png`, `workbench-narrow.png`, and `target-highlight-dark.png`.

## Integration defects found and fixed

- Old ID-repair behavior could legitimize a topology-changing local transform; replaced with fail-closed identity checking.
- Browser focus could restore an old native selection after choosing a section; explicit section targeting now survives delayed selection events.
- Restoring a section as a native full-range selection could replace its prose on immediate typing; section restore now uses a collapsed caret plus independent decoration.
- Large card autoscroll could change the element under the pointer before dragstart; the intended source ID is latched at pointerdown.
- Accepted word-to-phrase edits could stay labelled as Word Lens; accepted scope now reflects the phrase range.
- Candidate questions could write to the moved cursor's direction; they now bind to the original candidate target.
- Repeated idempotent layout writes could overwrite useful guidance with a Preferences saved toast; unchanged layout settings no longer trigger saves.
- Empty-note-driven targets were hidden/disabled by text-only UI guards; meaningful structural context now enables coaching.

## Limits and remaining friction

No live OpenAI or actual desktop Wispr/IME verification was possible without credentials/desktop tooling. Provider tests use the official SDK with injected offline transport; mock comparisons are not evidence of model quality.

Cross-section destructive text operations are intentionally refused. Comparison candidates are not silently rebased. Narrow layouts can require vertical scrolling to the Inspector. Long prose/notes are clamped or independently scrollable in cards/context, with the full canonical editor available. No independent novice usability study was performed.

Previously documented limits remain: 2MB request bodies, growing history/context, no unsaved crash journal, no automatic multi-tab merge, no public-deployment authentication/encryption, and unimplemented gateway adapters. Boundary protection is an editing invariant, not a repair or recovery system for previously damaged documents.
