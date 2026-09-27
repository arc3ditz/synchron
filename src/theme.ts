import type { CSSProperties } from "react";

// One elevated-surface recipe shared by every card in every view
// (habit rows, focus timer, history metrics, analytics panels).
export const CARD_SURFACE: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-color)",
  borderRadius: 8,
  padding: "15px 16px",
};
