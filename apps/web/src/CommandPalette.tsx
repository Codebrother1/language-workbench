import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { searchCommands } from "./commands";
import { Button } from "./ui";
export function CommandPalette({
  initialQuery = "",
  close,
  run,
}: {
  initialQuery?: string;
  close: () => void;
  run: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery),
    [active, setActive] = useState(0);
  const results = searchCommands(query);
  const visible = results.slice(0, 40);
  const activeIndex = Math.min(active, Math.max(0, visible.length - 1));
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    document
      .getElementById("command-option-" + activeIndex)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, query]);
  const choose = (id: string) => {
    dialog.current?.close();
    close();
    run(id);
  };
  return (
    <dialog
      className="command-palette"
      ref={dialog}
      aria-label="Find a writing tool"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <header>
        <Search size={18} />
        <input
          ref={input}
          role="combobox"
          aria-label="Search writing tools"
          aria-expanded="true"
          aria-controls="writing-command-list"
          aria-activedescendant={
            visible.length ? "command-option-" + activeIndex : undefined
          }
          aria-autocomplete="list"
          value={query}
          placeholder="What do you want to do?"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % Math.max(1, visible.length));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(
                (i) =>
                  (i - 1 + Math.max(1, visible.length)) %
                  Math.max(1, visible.length),
              );
            }
            if (e.key === "Enter" && visible[activeIndex]) {
              e.preventDefault();
              choose(visible[activeIndex].id);
            }
          }}
        />
        <Button aria-label="Close command palette" onClick={close}>
          <X size={16} />
        </Button>
      </header>
      <p className="command-hint">
        Find a tool by what you want to do—“synonyms”, “my hooks”, “add segue”.
      </p>
      <div
        id="writing-command-list"
        role="listbox"
        aria-label="Writing tools"
        className="command-results"
      >
        {visible.map((c, i) => (
          <button
            type="button"
            id={"command-option-" + i}
            key={c.id}
            role="option"
            aria-selected={i === activeIndex}
            className={i === activeIndex ? "selected" : ""}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(c.id)}
          >
            <span>{c.label}</span>
            <small>{c.description}</small>
            <em>{c.group}</em>
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className="command-empty" role="status">
          No matching tool. Try “word”, “structure”, “source” or “library”.
        </p>
      )}
      <footer>
        <span>↑ ↓ Choose · Enter Open · Esc Back</span>
        <span>⌘ / Ctrl K</span>
      </footer>
    </dialog>
  );
}
