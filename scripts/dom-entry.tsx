/**
 * Test-only entry for the DOM verification harness. It only re-exports the
 * modules the harness renders; all behavior checks live in verify-dom.ts.
 */
export { default as App } from "../src/App";
export { ConfirmationProvider } from "../src/components/Overlays";
