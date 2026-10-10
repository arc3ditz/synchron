import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const themeSource = readFileSync(path.join(root, "src/theme.ts"), "utf8");
const cssSource = readFileSync(path.join(root, "src/styles/index.css"), "utf8");

const componentFiles = [
  "src/App.tsx",
  "src/components/Tasks.tsx",
  "src/components/Projects.tsx",
  "src/components/FocusTimer.tsx",
  "src/components/History.tsx",
  "src/components/Today.tsx",
  "src/components/Onboarding.tsx",
  "src/components/CommandPalette.tsx",
];
const sources = new Map(
  componentFiles.map((file) => [file, readFileSync(path.join(root, file), "utf8")]),
);

test("FORM_CONTROL keeps the canonical 42px fixed-height geometry", () => {
  assert.ok(themeSource.includes("height: \"var(--control-height)\""), "fixed height");
  assert.ok(themeSource.includes("minHeight: \"var(--control-height)\""), "matching min-height");
  assert.ok(themeSource.includes("padding: \"var(--control-padding)\""), "shared padding");
  assert.ok(themeSource.includes("borderRadius: \"var(--control-radius)\""), "shared radius");
  assert.ok(themeSource.includes("fontSize: \"var(--control-font-size)\""), "shared font size");
  assert.ok(themeSource.includes("lineHeight: \"var(--control-line-height)\""), "shared line height");
  // Sizing stays token-driven: no pixel literals in the geometry properties
  // (the 1px border is part of the spec and covered by border-box sizing).
  const spec = themeSource.slice(themeSource.indexOf("export const FORM_CONTROL"));
  const sizing = [...spec.matchAll(/(?:height|padding|borderRadius|fontSize|lineHeight): "([^"]+)"/g)]
    .map((m) => m[1])
    .join(" ");
  assert.ok(!/\d+px/.test(sizing), "no hardcoded pixel geometry in FORM_CONTROL");
});

test("the reference Add-a-Habit input uses the shared control spec", () => {
  const appSource = sources.get("src/App.tsx");
  const inputBlock = appSource.match(/input: \{[\s\S]*?\n  \},/);
  assert.ok(inputBlock, "App must define the shared input style");
  assert.ok(inputBlock[0].includes("...FORM_CONTROL"), "reference input inherits FORM_CONTROL");
});

test("every component with selects or textareas builds them on FORM_CONTROL", () => {
  for (const [file, source] of sources) {
    if (source.includes("<select") || source.includes("<textarea")) {
      assert.ok(
        source.includes("...FORM_CONTROL"),
        `${file} must style its selects/textareas from FORM_CONTROL`,
      );
    }
  }
});

test("range sliders join the control family instead of rendering native-sized", () => {
  const block = cssSource.match(/\.ui-range \{[\s\S]*?\n\}/);
  assert.ok(block, ".ui-range must exist");
  assert.ok(block[0].includes("height: var(--control-height)"), "range matches control height");
  assert.ok(block[0].includes("min-height: var(--control-min-height)"), "range matches control min-height");

  const appSource = sources.get("src/App.tsx");
  const rangeInputs = [...appSource.matchAll(/<input[\s\S]*?type="range"[\s\S]*?\/>/g)];
  assert.ok(rangeInputs.length > 0, "range inputs exist");
  for (const [input] of rangeInputs) {
    assert.ok(input.includes("ui-range"), "every range input must carry the family class");
  }
});

test("form controls keep usable focus, disabled, and theme behavior", () => {
  assert.ok(cssSource.includes("input:focus-visible"), "inputs keep a visible focus ring");
  assert.ok(cssSource.includes("select:focus-visible"), "selects keep a visible focus ring");
  assert.ok(cssSource.includes("textarea:focus-visible"), "textareas keep a visible focus ring");
  assert.ok(cssSource.includes("input:disabled"), "disabled controls stay visibly distinct");
  assert.ok(cssSource.includes(":root[data-theme=\"light\"]"), "light theme tokens must exist");
  assert.ok(cssSource.includes("color-scheme: light"), "light color scheme must apply");
  // Accent used by native controls (range, date pickers) resolves in both themes.
  const accentDefs = [...cssSource.matchAll(/--color-accent: ([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(accentDefs.length >= 2, "accent must be defined for dark and light themes");
});
