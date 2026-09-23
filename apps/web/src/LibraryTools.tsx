import { useState } from "react";
import type { Workspace } from "./useWorkspace";
import type { LibraryItem } from "./domain";
import { Button, Field } from "./ui";
export function QuickSave({
  w,
  text,
  origin = "selection",
}: {
  w: Workspace;
  text: string;
  origin?: "selection" | "candidate" | "structure";
}) {
  const [notes, setNotes] = useState("");
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  const save = (
    kind: LibraryItem["kind"],
    extra: Partial<LibraryItem> = {},
  ) => {
    void w
      .saveLibraryItem({
        kind,
        content: text,
        notes,
        sectionKinds: section ? [section.kind] : [],
        provenance: {
          documentId: w.doc.id,
          sectionId: section?.id,
          ...(origin === "candidate" && w.activeRun
            ? {
                runId: w.activeRun.id,
                ...(w.activeRun.model ? { model: w.activeRun.model } : {}),
              }
            : {}),
        },
        ...extra,
      })
      .then(() =>
        w.setNotice("Saved to your library. Metadata can be edited there."),
      )
      .catch((e) => w.setError(e.message));
  };
  return (
    <details className="quick-save">
      <summary>
        {origin === "candidate"
          ? "Save candidate to library"
          : "Save to library"}
      </summary>
      <Field label="Why keep this? (optional)">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What does this language do well?"
        />
      </Field>
      <div className="quick-save-options">
        {(
          [
            ["snippet", "Save exact snippet"],
            ["pattern", "Save as pattern"],
            ["move", "Save as rhetorical move"],
            ["style_example", "Save as style example"],
          ] as const
        ).map(([kind, label]) => (
          <Button
            disabled={!text.trim() || !w.libraryReady}
            key={kind}
            onClick={() => save(kind)}
          >
            {label}
          </Button>
        ))}
        {section && (
          <Button
            disabled={!text.trim() || !w.libraryReady}
            onClick={() =>
              save("style_example", {
                tags: ["style-guide"],
                notes:
                  notes ||
                  "A section-style example, not a command to reuse these words.",
              })
            }
          >
            Add to {section.kind} Style
          </Button>
        )}
        <Button
          disabled={!text.trim() || !w.libraryReady}
          onClick={() => save("snippet", { myLanguage: true })}
        >
          Add to My Language
        </Button>
      </div>
      <p className="small muted">
        Saved verbatim. Examples and patterns are references, not automatic
        insertion rules. Edit slots or preferences in the Library.
      </p>
    </details>
  );
}
export function ContextLibrary({ w }: { w: Workspace }) {
  const section = w.doc.sections.find((s) => s.id === w.target?.sectionId);
  return (
    <details className="context-library">
      <summary>
        From your {section?.kind ?? "writing"} library{" "}
        <span className="count">{w.relevantItems.length}</span>
      </summary>
      {!w.relevantItems.length && (
        <p className="small muted">
          Save language you like. Nothing is inserted automatically.
        </p>
      )}
      {w.relevantItems.map((item) => (
        <article key={item.id}>
          <span className="eyebrow">{item.kind.replaceAll("_", " ")}</span>
          <b>{item.title}</b>
          <p>{item.content}</p>
          {item.notes && <p className="small muted">{item.notes}</p>}
          <div className="row wrap">
            <Button onClick={() => w.copy(item.content)}>
              Copy saved item
            </Button>
            {["snippet", "style_example"].includes(item.kind) && (
              <Button onClick={() => w.previewLibraryItem(item)}>
                Preview for target
              </Button>
            )}
            {item.kind === "pattern" && (
              <Button
                onClick={() => {
                  if (
                    !item.content.includes("[X]") ||
                    !item.content.includes("[Y]")
                  )
                    return w.setError(
                      "Add [X] and [Y] slots to this pattern in the Library before using it as a scaffold.",
                    );
                  w.setStructure((d) => ({
                    ...d,
                    customTemplate: item.content,
                  }));
                  w.setNotice(
                    "Pattern loaded into Structure. Fill the slots; nothing was inserted.",
                  );
                }}
              >
                Use in builder
              </Button>
            )}
            <Button onClick={() => w.setPanel("library")}>
              Edit in library
            </Button>
          </div>
        </article>
      ))}
      <Button className="text-button" onClick={() => w.setPanel("library")}>
        Browse Personal Library
      </Button>
    </details>
  );
}
export function StyleContext({ w }: { w: Workspace }) {
  return (
    <details className="style-context">
      <summary>Style for this target</summary>
      <p className="small muted">
        Most specific wins. Plain prose is ordered guidance; key: value lines
        have deterministic overrides.
      </p>
      {w.resolvedStyle.layers
        .filter((l) => l.source === "global" || l.text.trim())
        .map((layer) => (
          <div key={layer.source}>
            <b>{layer.source.replaceAll("_", " ")}</b>
            <p>{layer.text}</p>
          </div>
        ))}
      <details>
        <summary>Resolved named preferences</summary>
        {Object.entries(w.resolvedStyle.effective).map(([key, v]) => (
          <p key={key}>
            <b>{key}:</b> {v.value || "(cleared)"}{" "}
            <small>— {v.source.replaceAll("_", " ")}</small>
          </p>
        ))}
      </details>
      <Button onClick={() => w.setPanel("guides")}>
        Edit scoped style guides
      </Button>
    </details>
  );
}
