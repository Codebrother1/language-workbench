# The Mac desktop app

Language Workbench runs locally on your Mac. The desktop app opens the same writing workspace as the local browser version, but has its **own writing data**. You do not need a terminal, a cloud account, or an API key to begin writing. The current packaged build is for Apple Silicon Macs and is unsigned; macOS may ask you to approve it on first launch. Copy the `.app` into Applications and open it from Finder. The app does not update itself.

The desktop app starts a local service when it opens and closes it when you quit. Opening the app again while it is running brings its window forward. It does not connect to a hosted Language Workbench account or sync your documents to another device.

## Your writing and your key

Desktop writing lives under `~/Library/Application Support/Language Workbench/`. **AI providers → Open desktop data folder** opens that folder. Browser development and desktop development keep separate data; installing the app does not bring over writing from either one. To move a document, export its **document JSON** from the old workspace and use **Import JSON** in the desktop app. Export and import the [Personal Library](personal-library.md) separately if you use it. A finished-piece PDF, DOCX or Markdown file is for reading or sharing, not for bringing back all your writing choices.

To use your own OpenAI key in the installed app, open **AI providers → OpenAI Direct → Add API key**. The app saves it locally through macOS secure storage, separately from your writing database. You do not need to edit a `.env` file. You can replace the key or confirm **Remove key** in the same panel. Removing it does **not** delete documents, library items, cached model information or model-routing preferences. A removed key is not silently replaced by a legacy or environment key. If the saved key cannot be unlocked, the app reports it unavailable instead of silently switching credentials.

Adding a key does not choose a paid model for you. Select one deliberately if you want to use OpenAI. **Test connection** makes a small real request that may cost money; **Refresh models** fetches the model list separately, without running a writing request. See [Models and routing](models-and-routing.md).

## Backups and downloads

On launch, if a desktop writing database already exists, the app makes a timestamped snapshot in the `backups/` folder before opening it. There is no snapshot on the first empty launch, and old snapshots are not automatically removed. These snapshots contain saved writing and settings, **not** an OpenAI key or edits that have not finished saving. Wait for **Saved** before closing.

Downloads in the desktop app ask where to save the file. Open [Export and delivery](export-and-delivery.md) to choose between a reading copy and a document-data export. For backup scope and safe recovery, see [Data and backups](data-and-backups.md).

If the app cannot start, its log is at `~/Library/Application Support/Language Workbench/logs/desktop.log`. See [Troubleshooting](troubleshooting.md) for first-launch and recovery steps.

[Documentation home](index.md)
