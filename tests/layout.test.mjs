import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cssSource = readFileSync(path.join(root, "src/styles/AppLayout.css"), "utf8");
const themeSource = readFileSync(path.join(root, "src/theme.ts"), "utf8");
const historySource = readFileSync(path.join(root, "src/components/History.tsx"), "utf8");
const analyticsSource = readFileSync(path.join(root, "src/components/Analytics.tsx"), "utf8");

test("cards stay flat and token-padded (no decorative effects)", () => {
  const card = themeSource.match(/export const CARD_SURFACE[\s\S]*?\n\};/);
  assert.ok(card, "shared card surface must exist");
  assert.ok(!/shadow/i.test(card[0]), "cards must not introduce shadows");
  assert.ok(!/rgba\(.*0\.\d* *\)/.test(card[0]) || card[0].includes("border"), "cards stay solid");
  assert.ok(card[0].includes("var(--space-4)"), "card padding follows spacing tokens");
});

test("calendar grids keep seven uniform columns", () => {
  assert.ok(
    historySource.includes('gridTemplateColumns: "repeat(7, minmax(0, 1fr))"'),
    "history calendar keeps a 7-column grid",
  );
  assert.ok(
    analyticsSource.includes("repeat(7, minmax(0, 1fr))"),
    "heatmap keeps a 7-column grid",
  );
});

test("responsive breakpoints keep content usable at narrow widths", () => {
  for (const query of [
    "@media (max-width: 899px)",
    "@media (min-width: 900px)",
    "@media (max-width: 1180px)",
    "@media (max-width: 640px)",
    "@media (max-width: 520px)",
    "@media (max-width: 400px)",
  ]) {
    assert.ok(cssSource.includes(query), `breakpoint ${query} must exist`);
  }
  assert.ok(cssSource.includes("flex-wrap: wrap"), "form rows must wrap instead of overflowing");
  assert.ok(cssSource.includes("min-width: 0"), "flex children must be allowed to shrink");
  assert.ok(cssSource.includes("overflow-wrap: anywhere"), "long text must wrap inside cards");
});

test("the sidebar never overlaps content in either state", () => {
  assert.ok(cssSource.includes("width: 232px"), "expanded rail keeps its fixed width");
  assert.ok(
    cssSource.includes(".sidebar.collapsed") && cssSource.includes("width: 64px"),
    "collapsed rail keeps its fixed narrow width",
  );
  assert.ok(cssSource.includes("overflow-x: hidden"), "rail animation must not cause sideways scroll");
});
