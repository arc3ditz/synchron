import { X } from "lucide-react";
import { type CSSProperties } from "react";
import type { ShortcutGroup, KeyboardShortcutsModalProps } from "../types";

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "grid",
    placeItems: "center",
    padding: 20,
    background: "var(--overlay-dim)",
    backdropFilter: "blur(8px)",
  },
  modal: {
    width: "min(100%, 520px)",
    maxHeight: "80vh",
    padding: 28,
    background: "var(--bg-surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: 12,
    boxShadow: "0 24px 70px var(--shadow-strong)",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: {
    margin: 0,
    color: "var(--text-primary)",
    fontSize: 20,
    fontWeight: 600,
  },
  closeButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    background: "transparent",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 0,
    transition: "all 0.15s ease",
  },
  group: {
    marginBottom: 20,
  },
  groupTitle: {
    margin: "0 0 12",
    color: "var(--text-body)",
    fontSize: 13,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shortcut: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid var(--border-color)",
  },
  shortcutDescription: {
    color: "var(--text-secondary)",
    fontSize: 14,
  },
  keys: {
    display: "flex",
    gap: 4,
    alignItems: "center",
  },
  key: {
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
    fontFamily: "ui-monospace, monospace",
  },
};

const shortcutGroups: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: "⌘1", description: "Go to Today" },
      { keys: "⌘2", description: "Go to My Habits" },
      { keys: "⌘3", description: "Go to Programs" },
      { keys: "⌘4", description: "Go to Goals" },
      { keys: "⌘5", description: "Go to Timer" },
      { keys: "⌘6", description: "Go to History" },
      { keys: "⌘7", description: "Go to Analytics" },
      { keys: "⌘,", description: "Go to Settings" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: "⌘/", description: "Show Keyboard Shortcuts" },
      { keys: "Esc", description: "Close Modal" },
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Keyboard Shortcuts</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {displayGroups.map((group, groupIndex) => (
          <div key={groupIndex} style={styles.group}>
            <h3 style={styles.groupTitle}>{group.title}</h3>
            {group.shortcuts.map((shortcut, shortcutIndex) => (
              <div key={shortcutIndex} style={styles.shortcut}>
                <span style={styles.shortcutDescription}>
                  {shortcut.description}
                </span>
                <div style={styles.keys}>
                  {shortcut.keys.split(" ").map((key, keyIndex) => (
                    <span key={keyIndex} style={styles.key}>
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default KeyboardShortcutsModal;
