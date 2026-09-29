import type { CSSProperties } from "react";

// One elevated-surface recipe shared by every card in every view
// (habit rows, focus timer, history metrics, analytics panels).
export const CARD_SURFACE: CSSProperties = {
  background: "var(--card-surface-bg)",
  border: "1px solid var(--card-surface-border)",
  borderRadius: 12,
  padding: "15px 16px",
};
