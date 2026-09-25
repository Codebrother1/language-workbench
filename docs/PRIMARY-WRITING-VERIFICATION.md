# Workbench card composition verification

This pass makes Workbench the normal place to capture, write, and rearrange. It retains `Document.sections` as the sole ordered content model and the existing TipTap editor as the sole prose editor.

## Behavior

- **New thought** accepts native text input or dictation. Enter creates a Freeform section and keeps the field ready; Shift+Enter remains a newline. A first thought fills an untouched empty starter section without replacing its ID. Composition Enter does not submit.
- In Comfortable mode, click the selected card's **Writing · reader-facing prose** area to move the existing TipTap `EditorView` into that card. A pointer click places the caret near the clicked text. Keyboard activation starts at the section beginning. Ordinary selection, replacement, paste, formatting, and editor undo/redo remain available. **Storyboard · private note / AI context** stays outside the editor and exported prose. Role is secondary and optional.
- The Workbench assembled readout updates from the same `Document.sections`. Document View moves the editor back to its original mount for rich whole-piece editing. No card-specific prose buffer or second editor is created.
- Overview presents role, title, prose excerpt, and short note cue; switching density closes open section options. Dragging identifies the moving card and displays the insertion marker. Dropping commits order; Move Up/Down remain available.

## Verification

Final run on `main` before commit:

| Command | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm test` | 346 passed / 20 files |
| `pnpm build` | Passed |
| `pnpm test:e2e` | 77 passed, including three new card-composition tests |
| `pnpm test:production` | Passed compiled-server restart and persistence checks |

The new browser coverage captures five thoughts without entering Document View, writes actual prose in each card, leaves three Freeform, converts Point and Example, inserts a relational Segue, checks upward and downward drag markers and order, reloads, compares Document View, and returns to revise a card. Separate checks cover native paste, selected-text replacement, undo/redo, composition-safe capture, one editor instance, stable IDs, and first-click caret placement. Existing boundary, Lens, variants, routing, library, sources, structure, clipboard, and persistence suites still pass.

## Manual writing pass

Ran the compiled app on isolated port 4320 and a temporary database. In Workbench, captured a seven-section short essay titled **The bus without headphones**, revised its ending directly in its card, added a private Hook note, assigned Hook/Point/Example/Segue/Closer roles while leaving two sections Freeform, and moved the Point ahead of the Example. Reload retained prose, order, roles, and note. Overview gave a useful arc scan; Document View showed the same assembled writing when opened at the end.

## Remaining friction

- The card's first click moves the editor and maps the pointer to a nearby caret position. This is useful for sentence entry, but exact character placement can vary slightly when the read-only excerpt and editor wrap differently.
- While the editor is inside a card, the Workbench assembled readout is plain text. Rich formatting remains in the canonical section content and appears in Document View.
- A narrow Overview still scrolls for a seven-section piece; its compact rows and note cues help, but it is not a zoomable timeline.
- Native input and composition paths are covered. Actual Wispr Flow overlay behavior was not available to verify in this environment.

Future Idea Space and Draft Sequence work can separate spatial organization from reader order later. This pass adds no new domain object, alternate draft sequence, or copied prose store.
