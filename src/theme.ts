import type { CSSProperties } from "react";

// Synchron Atelier surface system: warm ink/paper, ember accent,
// serif display numerals, hairline grouped lists, pill actions.
export const CARD_SURFACE: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-4)",
};

// Canonical form-control spec: 40px pill-soft controls, one family.
export const FORM_CONTROL: CSSProperties = {
  boxSizing: "border-box",
  height: "var(--control-height)",
  minHeight: "var(--control-height)",
  padding: "var(--control-padding)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--control-radius)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: "var(--control-font-size)",
  lineHeight: "var(--control-line-height)",
};
