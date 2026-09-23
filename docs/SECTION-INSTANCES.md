# Composition: types configure behavior; instances compose the document

This checkpoint extends `362048d` without changing the editor or AI/provider architecture.

## Invariant

`Document.sections` is an ordered array of reusable `WritingSection` instances. Each has a stable ID and a `kind` referring to a shared semantic configuration. There are no `point1`, `point2`, single-hook fields, per-kind count limits, or prescribed order.

Zero Hooks, repeated Points/Segues/Callbacks, no Closer, and arbitrary Freeform sections are valid. A section's type determines available workbench configuration and inherited preferences; it does not reserve a unique slot in a template. Changing the Writing Brief still does not restructure existing writing. Any future preset must only create an initial array, not add constraints to it.

The rich editor needs a writable caret container. Deleting the final section therefore leaves one fresh, empty Freeform instance—not a required Hook, Point, or Closer. This is an editor affordance, not a composition template. Practical memory/request-size limits still apply; “unlimited instances” means no artificial per-type cardinality restrictions.

## Controls

- Hover over a section boundary, or keyboard-focus its gutter button, to reveal `+`.
- Boundaries include before the first section, every pair of sections, and after the last.
- The picker names its exact position, suggests a few common types, and keeps **All section types** searchable and available.
- Focus a section in Structure View and open Section options for **Insert above**, **Insert below**, **Duplicate section**, type conversion, reorder, merge, or confirmed removal.
- The existing Add section remains a one-click blank append. Existing split-at-cursor remains available.
- Escape dismisses the insertion picker and restores focus to its originating button. Clicking outside dismisses without taking focus from the clicked control.

The insertion anchor is the next section's stable ID plus the document ID, not a stale numerical index. A missing anchor fails explicitly; it does not silently insert somewhere else.

## Duplication and integration

A duplicate is inserted immediately below its source and labelled with ` — copy`. It deep-copies rich content, notes, model override, local instruction/answer/control/builder drafts, variants, runs, and source-targeted iteration history. It gets fresh section, variant, run, proposal, and history identities. Active-run and proposal-state references are remapped consistently.

Only targets owned by the source section are rebound to the new instance. Foreign or deleted historical targets remain stale rather than being reinterpreted as permission to edit the copy. Original ranges/snapshots are preserved; cloning is not a stale-anchor repair operation.

Brand-new sections begin with ordinary defaults and inherit the existing document/type/task/application model routing and scoped Style Guides. They participate in the same editor, Structure View, drag/reorder, source-aware read context, exact edit targets, autosave, variants, history and clipboard paths. No separate editor or “Lab” was introduced.

Section removal retains existing history for provenance. Rich-editor undo can restore the removed section and its metadata during the editing session; history undo is not persisted across browser restarts. Explicit structural edits are separated into undo groups so undoing an insertion does not also undo preceding typing.

## Input-safe implementation

Insertion controls are a **sibling overlay outside contenteditable**, measured against the existing section DOM. Resize, editor transactions, mutation and font-load events keep their boundary positions synchronized. The writing area remains pointer-transparent except for the small gutter buttons. Hover detection is passive; no typing, clipboard or composition shortcuts are intercepted.

An initial ProseMirror-widget experiment put non-editable buttons inside the editable DOM. Existing tests exposed broken Ctrl+Home/paste/rapid insertion. That implementation was removed, not patched by bypassing tests or replacing native shortcuts. A second layout check found transparent overlay rows intercepting clicks; rows are now pointer-transparent, with only gutter buttons interactive. `apps/web/src/editor.ts` is unchanged from the protected baseline.

## Verification — 2026-09-23

- TypeScript: passed for domain, API and frontend.
- Unit/integration: **267 passed**, including 44 new section-instance tests.
- Playwright: **45 passed**, including all prior 38 and 7 new composition flows.
- Production build: passed.
- Existing actual-process SQLite restart/security smoke: rerun and passed.
- Original regression tests were not deleted or weakened.
- Light/dark running screenshots: `screenshots/section-insertion-light.png` and `screenshots/section-insertion-dark.png`.

New browser evidence covers start/middle/end insertion; hover/focus and all types; search; above/below; type conversion; drag/reorder; insertion undo/redo; final-section delete confirmation/undo; deep duplicate independence and pending proposal acceptance; six Points with zero Hooks/Closers; exact clipboard output without control text; inherited Segue model/style rules; global read context with local application; reload persistence; Escape/focus and desktop layout.

Launch and test commands remain unchanged. Live OpenAI and real OS-level Wispr are still not claimed as verified; the preserved browser tests exercise native clipboard, rapid text insertion and synthetic composition behavior.
