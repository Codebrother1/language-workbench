# Workspace shell verification

The Workbench, Preview, and Inspector are docked views of the existing document, editor, and section workbench. They remain mounted when hidden. Layout settings persist `workbenchVisible`, `previewVisible`, `inspectorVisible`, density, primary view, and width weights; older settings receive defaults. All seven nonempty pane combinations are available through the visible Show/Hide buttons. The Layout menu offers Writing (Workbench dominant, Preview secondary), Review (Document View dominant with Inspector), Workbench only, All panes, and Reset layout. A visible divider supports pointer dragging and Left/Right arrow resizing. The last visible pane cannot be hidden accidentally.

Workbench shows persistent Draft and Parked count buttons above its cards. Each button scrolls the Workbench pane to its area without changing `Document.sections`. Parked prose remains editable, and Include keeps its existing exact-position chooser. The shell uses the same `EditorContent`; no copy of prose or separate editor is created. On medium widths, a visible Inspector stacks beneath the other two panes; below 900 px, visible panes stack in one column and dividers disappear. Pane toggles and presets remain usable there.

`tests/e2e/workspace-shell.spec.ts` covers pointer and keyboard resizing, width/visibility reload, presets, all pane combinations, unsent capture retention, Inspector direction retention, one editor instance, Draft/Parked navigation, parked editing and reinclusion, narrow stacking, and no page-level horizontal overflow. Existing card, boundary, Segue, clipboard, and parked-thought suites remain regression checks.

## Manual writing pass

Ran the built application on isolated port 4321 with temporary SQLite storage. Wrote **The marker on the map** as five rough thoughts, parked a side story, and revised its prose directly in the parked card. Writing gave the cards most width with Preview beside them and Inspector hidden. Review gave Document View the largest pane, with compact structure and Inspector alongside. Workbench only used the full width. Draft/Parked navigation made the side story reachable without scrolling through the four draft cards. Reincluding it preserved the revised prose. Reload restored the selected layout. Selecting Document View from a hidden Preview now reveals the document for that visit and restores the hidden Workbench preference on return.

A later large-document pointer check used an isolated offline fixture with nine draft sections, two parked thoughts and a named group. The writer manually dragged a draft card by its grip and confirmed the insertion marker, card reorder and live assembled-Preview reorder all worked. The existing drag implementation was left unchanged; automated pointer checks remain useful regression gates but are not substitutes for this human check.

## Remaining friction and next step

At narrower desktop widths, Inspector stacks below the other panes rather than sharing a row; this keeps the writing surface usable but means Inspector work can require vertical scrolling. Pane order is fixed. A constrained left/right order switch should follow only if repeated use shows that placement, rather than width or visibility, is the remaining obstacle. Arbitrary docking and floating windows are outside this model.
