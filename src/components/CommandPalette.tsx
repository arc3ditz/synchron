import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { filterCommands, nextSelectedIndex, type PaletteCommand } from "../domain/commandPalette";

type CommandPaletteProps = {
  commands: PaletteCommand[];
  shortcutKey: string;
  onRunCommand: (commandId: string) => void;
  onClose: () => void;
};

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    padding: "12vh 16px 16px",
    background: "var(--overlay-dim)",
  },
  panel: {
    width: "min(100%, 560px)",
    maxHeight: "60vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 12,
    boxShadow: "0 24px 70px var(--shadow-strong)",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "14px 16px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-color)",
    color: "var(--text-primary)",
    fontSize: 15,
    outline: "none",
  },
  list: {
    margin: 0,
    padding: 6,
    listStyle: "none",
    overflowY: "auto",
  },
  item: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    color: "var(--text-body)",
    fontSize: 14,
    textAlign: "left",
    cursor: "pointer",
  },
  itemSelected: {
    background: "var(--accent-wash-soft)",
    color: "var(--text-primary)",
  },
  hint: {
    flexShrink: 0,
    color: "var(--text-muted)",
    fontSize: 12,
  },
  empty: {
    margin: 0,
    padding: "20px 16px",
    color: "var(--text-dim)",
    fontSize: 14,
    textAlign: "center",
  },
  footer: {
    display: "flex",
    gap: 12,
    padding: "8px 16px",
    borderTop: "1px solid var(--border-color)",
    color: "var(--text-muted)",
    fontSize: 12,
  },
};

export default function CommandPalette({ commands, shortcutKey, onRunCommand, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filtered = filterCommands(commands, query);

  // Focus the filter on open and return focus where it came from on close.
  // All keyboard handling lives on this input, so background shortcuts,
  // text fields, and buttons are never affected while the palette is open.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function runSelected() {
    const command = filtered[selected];
    if (command) onRunCommand(command.id);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        style={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          style={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a Command…"
          aria-label="Command Palette"
          aria-expanded={filtered.length > 0}
          aria-controls={listId}
          aria-activedescendant={filtered[selected] ? `palette-${filtered[selected].id}` : undefined}
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((current) => nextSelectedIndex(current, 1, filtered.length));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((current) => nextSelectedIndex(current, -1, filtered.length));
            } else if (event.key === "Enter") {
              event.preventDefault();
              runSelected();
            } else if (event.key === "Escape") {
              // The global handler also closes via closeTransient; stopping
              // propagation here keeps this self-contained too.
              event.stopPropagation();
              onClose();
            }
          }}
        />
        {filtered.length === 0 ? (
          <p style={styles.empty}>No matching commands.</p>
        ) : (
          <ul id={listId} style={styles.list} role="listbox" aria-label="Commands">
            {filtered.map((command, index) => (
              <li key={command.id} id={`palette-${command.id}`} role="option" aria-selected={index === selected}>
                <button
                  type="button"
                  style={{ ...styles.item, ...(index === selected ? styles.itemSelected : {}) }}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => onRunCommand(command.id)}
                  tabIndex={-1}
                >
                  <span>{command.label}</span>
                  {command.hint && <span style={styles.hint}>{command.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={styles.footer}>
          <span>↑↓ Navigate</span>
          <span>Enter Run</span>
          <span>Esc Close ({shortcutKey}K)</span>
        </div>
      </div>
    </div>
  );
}
