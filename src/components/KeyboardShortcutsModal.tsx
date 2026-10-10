import { X, Keyboard } from "lucide-react";
import type { ShortcutGroup, KeyboardShortcutsModalProps } from "../types";

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "⌘1", description: "Go to Today" },
      { keys: "⌘2", description: "Go to My Habits" },
      { keys: "⌘3", description: "Go to Tasks" },
      { keys: "⌘4", description: "Go to Timer" },
      { keys: "⌘5", description: "Go to Projects" },
      { keys: "⌘6", description: "Go to History" },
      { keys: "⌘7", description: "Go to Analytics" },
      { keys: "⌘,", description: "Go to Settings" },
      { keys: "⌘B", description: "Toggle Sidebar" },
      { keys: "⌘K", description: "Open Command Palette" },
    ],
  },
  {
    title: "My Habits",
    shortcuts: [
      { keys: "G", description: "Switch to Grid View" },
      { keys: "L", description: "Switch to List View" },
      { keys: "N", description: "Focus New Habit" },
      { keys: "E", description: "Edit the focused Habit" },
    ],
  },
  {
    title: "Timer",
    shortcuts: [{ keys: "Space", description: "Start or pause the timer" }],
  },
  {
    title: "General",
    shortcuts: [
      { keys: "⌘/", description: "Show Keyboard Shortcuts" },
      { keys: "Esc", description: "Close a modal, editor, or popover" },
      { keys: "⌘ Enter", description: "Save the active Habit edit" },
    ],
  },
];

function KeyboardShortcutsModal({ onClose, shortcutKey }: KeyboardShortcutsModalProps) {
  const displayGroups = shortcutGroups.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.map((shortcut) => ({
      ...shortcut,
      keys: shortcut.keys.replace("⌘", shortcutKey),
    })),
  }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="ui-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(100%, 520px)", maxHeight: "80vh", padding: 28, overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                background: "var(--accent-wash-soft)",
                color: "var(--color-accent)",
              }}
            >
              <Keyboard size={18} />
            </span>
            <div>
              <p className="atelier-eyebrow" style={{ margin: 0 }}>
                Reference
              </p>
              <h2 className="atelier-greeting" style={{ margin: 0, fontSize: "1.4rem" }}>
                Keyboard Shortcuts
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="ui-button ui-button--sm ui-button--ghost"
            style={{ minWidth: 32, padding: "6px 8px" }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {displayGroups.map((group) => (
          <section key={group.title} style={{ marginTop: 16 }} aria-label={group.title}>
            <h3 className="section-eyebrow" style={{ margin: "0 0 4px" }}>
              {group.title}
            </h3>
            <div className="atelier-group">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.description} className="atelier-group-row" style={{ justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>{shortcut.description}</span>
                  <span style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {shortcut.keys.split(" ").map((key, keyIndex) => (
                      <kbd
                        key={keyIndex}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 28,
                          height: 28,
                          padding: "0 8px",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 6,
                          color: "var(--text-primary)",
                          fontSize: 12,
                          fontWeight: 500,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
