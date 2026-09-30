# Troubleshooting

## OpenAI Direct says “Not configured”

You can still write and edit directly without a key. Removing a desktop OpenAI key keeps your model choices: if a run is still routed to OpenAI, restore the key or explicitly choose Offline for that route. The app will not switch providers for you. In the **installed Mac app**, open **Document actions → AI providers → OpenAI Direct → Add API key**. If secure storage reports the saved key unavailable, replace or remove it there. In the local browser development version, the key is read by the local backend from its repository-root `.env`; the browser has no key-entry form. A key by itself does not change an Offline model choice. **Test connection** is an optional real request that may cost money. See [Models and routing](models-and-routing.md).

## Models have not been refreshed, or my selected model is unavailable

Open **AI providers → OpenAI Direct → Refresh models** to update the list explicitly. Until the first refresh, locally known choices may be unverified. Check that the provider is enabled and configured. A saved model that is missing after refresh stays selected but is marked **Unavailable**; a manually entered ID does not guarantee availability. Choose a working model yourself if you want another route. The app will not make that paid decision silently.

## Offline responses seem repetitive or limited

Offline is a deterministic practice provider, not an on-device general-purpose model. Its lexical examples, whole-piece observations and Delivery rules have limited coverage; it cannot independently research current usage or offer semantic Technical Writing analysis. Repeating a run can repeat its fixtures. You can always keep writing and editing directly without a model.

## The Mac app will not open on first launch

The current Apple Silicon build is unsigned. After copying the `.app` into Applications, macOS may ask for explicit first-open approval. It is not a signed or notarized release and has no auto-updater. If the app shows a startup error, it does not reset your database; check `~/Library/Application Support/Language Workbench/logs/desktop.log`. An unavailable saved key may also need to be replaced after a reinstall. See [Desktop app](desktop-app.md).

## Where are my files and logs?

Choose **AI providers → Open desktop data folder**. Installed-app writing is in `~/Library/Application Support/Language Workbench/`, logs in `logs/desktop.log`, and startup database snapshots in `backups/`. Browser and desktop development use different data folders; installing the app does not import them. See [Data and backups](data-and-backups.md).

## How do I export the finished piece?

Choose **Document View → Copy whole piece**, or **Download → PDF / Word document (.docx) / Markdown (.md)**. Parked thoughts and private notes stay out. If PDF reports unsupported characters, try DOCX or Markdown. **Export JSON** is for a recoverable document, not a reader-facing file. See [Export and delivery](export-and-delivery.md).

## Did I delete a document, or archive it?

**Archive document** removes it from the normal switcher while keeping its sections, takes and history. Open **Document actions → Manage documents → Archived** to restore it. **Delete** is permanent after confirmation; exporting a backup beforehand is the safe way to keep a copy. A multi-document backup from Manage documents is document-only and has no batch import yet. See [Data and backups](data-and-backups.md).

## How do I restore a backup?

First identify whether it is a finished-piece file, one-document JSON, library JSON, a Manage documents export or a full desktop database snapshot: these preserve different things. For a document JSON, **Import JSON** makes a new document; import library JSON separately. For desktop snapshots or a full data-folder copy, **quit the app, preserve the current folder, stage a separate copy and verify it before replacing anything**. A startup snapshot does not include your key. Do not overwrite your only current database or mix in old SQLite companion files. See [Data and backups](data-and-backups.md).

[Documentation home](index.md)
