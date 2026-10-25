# Synchron — Project Instructions

## UI Design Standards

- Before substantial UI work, read `.agents/skills/apple-design/SKILL.md` and consult relevant references. Apply the guidance where appropriate.
- Preserve Synchron's visual identity: warm paper surfaces (`#F5F1E8`), ink typography (`#24231F`), restrained amber accents (`#D96C42`), and calm editorial hierarchy.
- Use Apple Human Interface Guidelines as a foundation, not a mandate to imitate stock macOS apps.
- Do not introduce Liquid Glass, glass-heavy styling, generic dashboard layouts, excessive chrome, nested-card clutter, decorative gradients, or unnecessary visual effects.
- Prioritize clear hierarchy, comfortable spacing, accessible contrast, keyboard support, and appropriately sized interaction targets.
- Use Lucide React icons consistently where they improve clarity. Avoid unnecessary icons and visual clutter.
- Prefer reusable, consistent components for dialogs, popovers, buttons, and other interactive controls.

## Implementation Principles

- Fix root causes instead of layering on CSS workarounds.
- Popovers must remain within the visible app window, position correctly relative to their anchors, and never introduce unwanted horizontal scrolling or resize the app window.
- Use Synchron-designed confirmation dialogs for app-owned confirmations instead of browser-native `alert()`, `confirm()`, or `prompt()` dialogs. Keep legitimate operating-system dialogs native.
- Preserve existing functionality and avoid unrelated refactors.
- Keep implementations appropriate for the existing Tauri, React, and TypeScript stack.

## Verification

- Inspect existing code and understand the current implementation before making changes.
- Run relevant checks and build commands after modifications when practical.
- Verify visual behavior in the running app when possible.
- Never claim a feature or fix works unless it has actually been verified.
- Report the files changed, checks performed, and any remaining issues honestly.