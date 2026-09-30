# Your data and backups

Language Workbench is currently **local-first**. Your writing is stored on this machine, not in a Language Workbench cloud account. Wait for the **Saved** indicator after editing, especially before quitting or making a backup. A sudden crash can lose changes that had not been saved yet. If saving fails while your draft is still on screen, export the current document before closing or reloading it.

## Which data lives where?

| Workspace                 | Writing data                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| Installed Mac app         | `~/Library/Application Support/Language Workbench/workbench.sqlite` |
| Local browser development | `data/workbench.sqlite` in the repository by default                |
| Desktop development       | `data/desktop-dev/workbench.sqlite` in the repository               |

These are separate workspaces. Opening the installed app will not automatically show writing made in development or tests. **AI providers → Open desktop data folder** opens the installed app's data folder. Its startup snapshots are in `backups/`; startup messages and errors are in `logs/desktop.log`. Tests use disposable data, not your installed-app library.

The desktop OpenAI key is stored separately through the Mac's secure credential storage. It is not in the writing database or a document export. Removing that key does not remove writing or routing choices. You do not need to edit `.env` for normal desktop use. Keep any manual copy of the whole app data folder private: it can contain an encrypted credential record or a legacy `.env`.

## Choose the right kind of copy

- **Download PDF, DOCX or Markdown** (or **Copy** in Document View) to share the assembled reading piece. These exclude parked sections and private Workbench material. They are **not** complete backups.
- **Export document JSON** to preserve one document's sections, including parked material, brief, sources, takes and local work. **Import JSON** makes another copy of that document with new identities; it does not restore global settings or your Personal Library.
- **Export library JSON** separately to preserve saved language, style guides and connector preferences. Importing library JSON adds copies rather than replacing what's already there.
- A **full data-folder backup**, made with the app closed, preserves saved documents (including archived ones), library, settings and model catalog together. It is the broadest local recovery copy.

The installed Mac app also takes a database snapshot at startup **if a database already exists**. This snapshot includes saved writing, archived-document markers, library, settings and model information, but not the separate key, log files or unsaved edits. It does not replace your own backup in another safe location.

## Restore carefully

Quit the app before working with its database. Keep the current data folder intact and make a separate copy before restoring anything; never overwrite your only copy of recent writing. For a startup snapshot, stage a **copy** of the chosen snapshot in a separate empty folder and check that it contains the work you expect before swapping folders. Do not pair a standalone snapshot with old SQLite `-wal` or `-shm` files. A restored snapshot may need you to add your API key again. If you are unsure, keep both the current folder and the snapshot and seek help rather than guessing.

For a manual full-folder backup, wait for **Saved**, quit the app, and copy the **whole** data folder, including any SQLite companion files. Do not copy just the database file while the app is running. The browser development workspace has a different data folder; do not copy its database into the desktop folder while either app is open. Move individual documents with JSON instead. More on reading exports is in [Export and delivery](export-and-delivery.md); [Troubleshooting](troubleshooting.md) covers common data questions.

[Documentation home](index.md)
