import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { filterCommands, nextSelectedIndex, type PaletteCommand } from "../domain/commandPalette";

type CommandPaletteProps = {
  commands: PaletteCommand[];
  shortcutKey: string;
  onRunCommand: (commandId: string) => void;
  onClose: () => void;
};

function groupLabel(id: string): string {
  if (id.startsWith("nav-") || id.startsWith("go-")) return "Navigate";
  if (id.startsWith("habit") || id.startsWith("task")) return "Habits and Tasks";
  if (id.startsWith("timer") || id.startsWith("focus") || id.startsWith("pomodoro")) return "Focus";
  if (id.startsWith("theme") || id.startsWith("view") || id.startsWith("setting")) return "Appearance";
  return "Commands";
}

export default function CommandPalette({ commands, shortcutKey, onRunCommand, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const filtered = filterCommands(commands, query);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, []);

  // Reset the highlighted result when the query changes.
  // Render-phase adjustment (no effect) keeps highlight and list atomic.
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setSelected(0);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { command: PaletteCommand; index: number }[]>();
    filtered.forEach((command, index) => {
      const group = groupLabel(command.id);
      const list = map.get(group) ?? [];
      list.push({ command, index });
      map.set(group, list);
    });
    return [...map.entries()];
  }, [filtered]);

  function runSelected() {
    const command = filtered[selected];
    if (command) onRunCommand(command.id);
  }

  return (
    <div className="modal-overlay" style={{ alignItems: "flex-start", paddingTop: "12vh" }} onClick={onClose}>
      <div
        className="ui-card"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        onClick={(event) => event.stopPropagation()}
        style={{ width: "min(100%, 560px)", maxHeight: "60vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border-color)" }}>
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="ui-input"
            style={{ flex: 1, border: "none", background: "transparent", padding: 0, height: "auto", minHeight: 0 }}
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
                event.stopPropagation();
                onClose();
              }
            }}
          />
          <kbd
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-muted)",
              border: "1px solid var(--border-strong)",
              borderRadius: 6,
              padding: "2px 6px",
              background: "var(--bg-inset)",
            }}
          >
            esc
          </kbd>
        </div>
        {filtered.length === 0 ? (
          <p style={{ margin: 0, padding: "24px 16px", color: "var(--text-dim)", fontSize: 14, textAlign: "center" }}>
            No matching commands.
          </p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Commands" style={{ margin: 0, padding: 6, listStyle: "none", overflowY: "auto" }}>
            {grouped.map(([group, items]) => (
              <li key={group}>
                <p className="section-eyebrow" style={{ margin: 0, padding: "10px 12px 4px" }}>
                  {group}
                </p>
                {items.map(({ command, index }) => (
                  <div key={command.id} id={`palette-${command.id}`} role="option" aria-selected={index === selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => onRunCommand(command.id)}
                      tabIndex={-1}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        background: index === selected ? "var(--accent-wash-soft)" : "transparent",
                        border: "none",
                        borderRadius: 8,
                        color: index === selected ? "var(--text-primary)" : "var(--text-body)",
                        fontSize: 14,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span className="truncate-1">{command.label}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        {command.hint && (
                          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{command.hint}</span>
                        )}
                        {index === selected && <CornerDownLeft size={14} style={{ color: "var(--color-accent)" }} />}
                      </span>
                    </button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        <div
          style={{
            display: "flex",
            gap: 12,
            padding: "8px 16px",
            borderTop: "1px solid var(--border-color)",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          <span>Up/Down Navigate</span>
          <span>Enter Run</span>
          <span>Esc Close ({shortcutKey}K)</span>
        </div>
      </div>
    </div>
  );
}
