import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cssSource = readFileSync(path.join(root, "src/styles/index.css"), "utf8");
const layoutSource = readFileSync(path.join(root, "src/styles/AppLayout.css"), "utf8");
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const projectsSource = readFileSync(path.join(root, "src/components/Projects.tsx"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");

function blockFor(selector) {
  const start = cssSource.indexOf(selector);
  assert.ok(start !== -1, `${selector} must exist`);
  const open = cssSource.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < cssSource.length; i++) {
    if (cssSource[i] === "{") depth++;
    if (cssSource[i] === "}") {
      depth--;
      if (depth === 0) return cssSource.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced block for ${selector}`);
}

function vars(block) {
  const out = new Map();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name, value.trim());
  }
  return out;
}

function resolve(varsMap, value) {
  let current = value.trim();
  const seen = new Set();
  while (current.startsWith("var(") && !seen.has(current)) {
    seen.add(current);
    const name = current.slice(4, current.indexOf(",") === -1 ? -1 : current.indexOf(",")).trim();
    const fallback = current.includes(",") ? current.slice(current.indexOf(",") + 1, -1).trim() : null;
    current = varsMap.get(name) ?? fallback;
    if (current === undefined || current === null) throw new Error(`unresolvable token ${value}`);
  }
  return current;
}

function luminance(hex) {
  const parts = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => {
    const channel = parseInt(parts.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const dark = vars(blockFor(":root"));
const light = new Map([...vars(blockFor(":root")), ...vars(blockFor(':root[data-theme="light"]'))]);

function themedPair(theme, textVar, bgVar) {
  const themeVars = theme === "dark" ? dark : light;
  return contrast(resolve(themeVars, textVar), resolve(themeVars, bgVar));
}

for (const theme of ["dark", "light"]) {
  test(`${theme} theme: body text roles meet AA contrast`, () => {
    for (const textVar of [
      "--color-text-primary",
      "--color-text-body",
      "--color-text-secondary",
      "--color-text-muted",
      "--color-text-dim",
    ]) {
      const ratio = themedPair(theme, `var(${textVar})`, "var(--color-bg)");
      assert.ok(ratio >= 4.5, `${theme} ${textVar} on background is ${ratio.toFixed(2)}, needs 4.5`);
    }
  });

  test(`${theme} theme: accent and status colors stay readable`, () => {
    assert.ok(themedPair(theme, "var(--color-accent)", "var(--color-bg)") >= 4.5, "accent on background");
    assert.ok(
      themedPair(theme, "var(--color-accent-contrast)", "var(--color-accent)") >= 4.5,
      "contrast text on accent buttons",
    );
    assert.ok(
      themedPair(theme, "var(--color-danger-text)", "var(--color-danger)") >= 4.5,
      "destructive action text",
    );
  });
}

test("checkboxes and switches expose state beyond color", () => {
  assert.ok(todaySource.includes('role="checkbox"'), "Today must use checkbox roles");
  assert.ok(todaySource.includes("aria-checked"), "Today must expose checked state");
  assert.ok(todaySource.includes("<Check"), "completed checkboxes must render a check mark, not color alone");
  // Tasks rows are toggle buttons: pressed state plus strikethrough text.
  assert.ok(tasksSource.includes("aria-pressed"), "Tasks toggles must expose pressed state");
  assert.ok(tasksSource.includes("line-through"), "completed tasks must strike through text, not color alone");
  assert.ok(appSource.includes('role="switch"'), "settings toggles must use switch roles");
});

test("progress indicators pair bars with text values", () => {
  for (const [file, source] of [["Projects.tsx", projectsSource]]) {
    assert.ok(source.includes('role="progressbar"'), `${file} must label progress bars`);
    assert.ok(source.includes("aria-valuenow"), `${file} must expose progress values`);
    assert.ok(source.includes("progressPercent") || source.includes("percent}%"), `${file} must show a text percent`);
  }
});

test("delete confirmations stay modal dialogs with names in both themes", () => {
  for (const [file, source] of [
    ["Projects.tsx", projectsSource],
    ["Tasks.tsx", tasksSource],
  ]) {
    assert.ok(source.includes('role="dialog"'), `${file} delete modal must be a dialog`);
    assert.ok(source.includes('aria-modal="true"'), `${file} delete modal must be modal`);
  }
  assert.ok(layoutSource.includes(".delete-modal"), "dialog surface styling must exist");
});
