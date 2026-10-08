import type { CSSProperties } from "react";

// Restrained Synchron surface system.
//
// Philosophy (reference: Streak Freeze active state on My Habits):
// quiet base, subtle surface shift, restrained accent wash, accent
// text/icon when active, minimal border, no shadow, no glow.
//
// Levels:
//   Base       -> application background (var(--bg-primary))
//   Raised     -> genuinely separated content (var(--bg-surface))
//   Interactive-> hover/selected washes, never glow
//   Overlay    -> dialogs/popovers only (stronger border + popover shadow)
//
// CARD_SURFACE is the single "raised" recipe. It is deliberately flat:
// solid background, 1px subtle border, no translucency, no shadow.
export const CARD_SURFACE: CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-color)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--space-4)",
};

// ONE canonical Synchron form-control specification. Every standard
// text/date/time/number/search input and every select inherits this exact
// geometry and surface, so all controls render as one component family.
// Fixed height (never min-height alone) keeps browser-native date, number,
// and select internals from changing the outer box. Visual reference: the
// Tasks page Priority / Goal / Project / Milestone controls.
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
