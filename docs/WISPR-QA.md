# Wispr and native-input QA

## What has and has not been verified

The app uses ordinary text inputs/textareas and one TipTap/ProseMirror contenteditable writing surface. It does **not** implement custom microphone capture, speech recognition, transcription, or a Wispr integration/API. Wispr must insert text through its normal desktop input mechanism.

Browser input and keyboard/clipboard flows, including Ctrl-based copy behavior, have been exercised in **Chromium on Linux**. Final automated evidence and counts belong in [VERIFICATION.md](VERIFICATION.md). Browser insertion simulations do not exercise Wispr's OS overlay, permissions, hotkeys, clipboard handoff, or accessibility integration.

**Actual Wispr OS-overlay testing could not run in the sandbox. The checklist below is pending manual execution on a desktop with Wispr installed and supported.** Do not describe this build as Wispr-certified or cross-platform dictation-verified based on browser automation alone.

## Preparation

1. Start the app following [README.md](../README.md), preferably with the API key unset for deterministic, no-provider-cost input testing.
2. Use a disposable document. Keep a backup/export of any valuable work.
3. Record OS/version, browser/version, Wispr/version, keyboard layout, input language, and app commit. Note whether you are testing development (`:5173`) or the built app (`:4318`).
4. Confirm Wispr works in a plain OS text field, permissions are granted, and its hotkey is not being intercepted by the browser.
5. Make at least two labeled sections with recognizable text before and after each intended insertion point. Keep the save indicator visible.

Use Ctrl on Windows/Linux or the equivalent Command shortcuts on macOS. Record the actual key sequence, not just “copy worked.”

## Manual checklist

For each row, record Pass / Fail / Not run, exact steps, expected versus observed text, and any unexpected focus/caret movement.

| Check | Procedure and expected result |
| --- | --- |
| Ordinary input baseline | Type into document title, a brief/source field, instruction/answer fields, and the editor. Native selection and cursor navigation should work. Input must not jump into another field. |
| Dictation at the beginning/end | Focus the editor at each position and use the real Wispr hotkey. Text should arrive once at the caret, without replacing surrounding text or moving to a different section. |
| Dictation in the middle | Place the caret between two known words in a paragraph. Dictate a short phrase. Both surrounding fragments and other sections should remain unchanged. |
| Long insertion | Dictate several paragraphs or a long passage. Check line breaks, Unicode, duplicates, truncation, responsiveness, caret position, and section boundaries. Wait for Saved, reload, and compare. |
| Select and replace | Select a word, then a sentence within one section, and dictate a replacement. Only the native selected range should change. Repeat in a textarea. |
| Punctuation and formatting | Dictate commas, quotes, apostrophes, parentheses, a dash, a question, and paragraph breaks. Inspect what Wispr actually emitted; distinguish Wispr transcription errors from app insertion errors. Check nearby bold/italic text is not unexpectedly lost. |
| Undo / redo | Immediately undo a dictated insertion, then redo it using native shortcuts. Observe actual undo grouping; do not require an arbitrary whole dictation session to be one undo step. Surrounding text and section identity should remain intact. |
| Copy / cut / paste | Copy and cut a selection with native shortcuts, paste it back, and try multiline/Unicode clipboard text. Verify no double paste, incorrect selection, or cross-section metadata corruption. Test the app's copy action separately from native copy. |
| Focus after overlay | Activate and dismiss Wispr, dictate again, then open/close an app dialog and return to the editor. Check where focus and the caret land. No hidden field should receive speech text. |
| IME / composition | Use a real IME (for example Japanese or Chinese), compose candidates, select a candidate, commit and cancel composition, and continue typing. No duplicated interim text, premature insertion, or unwanted target/focus jump should occur. Repeat in a normal input. Synthetic composition events alone are insufficient evidence. |
| Assistance after dictation | Dictate a passage, select part of it, diagnose, enter your own answer, and request proposals. Text should not change until explicit Apply. Only the indicated target should change; original text should be available as a variant. |
| Stale target guard | Request a proposal, then dictate into its source section before applying. Applying the old proposal should be refused rather than guessed into the changed text. Make a fresh selection/request to continue. |
| Save and reload | After dictation, wait for Saved and reload. Confirm exact inserted text, section labels/notes, and relevant variants remain. |
| Save failure | With a disposable document, stop the backend, make an edit, and observe the unsaved/error state. Export the current document before closing/reloading. Restart the backend and retry saving. Do not expect browser crash recovery for unflushed edits. |

Cross-section native selection/copy can be useful, but cross-section AI replacement is deliberately unsupported. Source material is currently displayed in a modal, not a pinned reference pane; test that limitation explicitly rather than assuming simultaneous source-and-editor interaction.

## Reporting a failure

Include:

- Environment and commit information from preparation.
- Field/section, starting text, exact selection/caret position, and whether a dialog was open.
- Dictated words, the text Wispr produced if available, and the final text inserted into the app.
- Reproduction rate, save state, and whether undo recovers the original.
- A short screen recording or screenshots, with private text and credentials removed.
- Whether the same operation works in a plain input on the same machine.

Separate **app defects**, **Wispr/OS behavior**, and **unverified behavior**. A browser-only pass is not an OS dictation pass; a source of uncertainty should remain “Not run” until tested.

## Result record

```text
Commit:
Date / tester:
OS:
Browser:
Wispr:
Keyboard layout / input language / IME:
Dev or built app:
Checklist row:
Result: Pass / Fail / Not run
Expected:
Observed:
Evidence / reproduction steps:
```
