# Parked thoughts verification

This pass separates project material from reader order within the existing `Document.sections` array. A section has `placement: draft | parked`; older documents default to draft. Park and Include retain the section ID and all section metadata. Workbench shows parked cards in a distinct area below the draft, with direct editing and section tools intact. Include requires an explicit draft position. New thought captures Freeform quickly; Add section and Add before/after all use the deliberate role picker.

Document View, its word count, plain text/Markdown export, and copy-all omit parked prose. JSON export retains it for round-trip editing. Relational Segue neighbors use draft order. The same TipTap editor remains canonical, including for a parked card; placement is an editor node attribute so session undo/redo can reverse Park and Include. Layout density, preview visibility, and Inspector visibility use persisted settings.

The browser workflow in `tests/e2e/parked-thoughts.spec.ts` captures five rough thoughts, writes prose in each, changes a role, parks one, checks Document View/count/copy/Markdown, edits the parked prose, reloads, and reincludes it before a chosen draft section. A second test checks model assignment, variants, history, notes, insertion before parked material, layout persistence, and Park/Include undo/redo. Domain tests cover legacy defaults and identity/metadata preservation. Existing insertion and native editor suites remain regression gates.

## Manual writing pass

Ran the built app on isolated port 4321 with a temporary SQLite directory. Wrote **The receipt in my coat** as seven rough thoughts. The ticket shoebox became an Example, the market paper bird a side idea, and the return phrase a possible Callback. Parked all three, moved the father reveal ahead of the faded ink, then explicitly included the Callback at draft end. The Example and side idea stayed parked. Document View read as a clean five-part draft and omitted both parked thoughts. The parked cards remained visibly part of the project, retained their Storyboard notes, and offered Include without rebuilding them.

Remaining friction: the parked area sits after the whole draft, so reaching it in a long 15-section arc still means scrolling. At a narrow viewport, cards become tall. This pass keeps the small single-sequence model and does not introduce spatial placement, clusters, or a second prose store.
