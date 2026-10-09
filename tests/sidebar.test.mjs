import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const cssSource = readFileSync(path.join(root, "src/styles/AppLayout.css"), "utf8");

const NAV_ITEMS = ["Today", "My Habits", "Tasks", "Timer", "Goals", "History", "Analytics", "Settings"];

test("every sidebar item keeps a tooltip, active wiring, and shortcut hint", () => {
  for (const label of NAV_ITEMS) {
    assert.ok(appSource.includes(`title="${label}"`), `${label} must keep its title tooltip`);
  }
  const itemButtons = appSource.split("sidebar-item ${view ===").length - 1;
  assert.equal(itemButtons, NAV_ITEMS.length, "one wired item per navigation entry");
  assert.ok(appSource.includes("aria-current={view ==="), "active item must expose aria-current");
});

test("the collapse control stays discoverable and labelled in both states", () => {
  assert.ok(appSource.includes('className="sidebar-collapse"'), "collapse control must exist");
  assert.ok(
    appSource.includes('aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}'),
    "collapse control must label both states",
  );
  assert.ok(appSource.includes("aria-expanded={!sidebarCollapsed}"), "collapse must expose expanded state");
  assert.ok(
    appSource.includes('title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}'),
    "collapse control must keep its tooltip in both states",
  );
  assert.ok(
    appSource.includes('"synchron-sidebar-collapsed"'),
    "collapsed preference must persist across reloads",
  );
  assert.ok(appSource.includes("toggleSidebar"), "collapse must stay wired to the sidebar shortcut");
});

test("keyboard navigation and collapse keep working regardless of sidebar state", () => {
  for (const [key, view] of [["1", "Today"], ["2", "Habits"], ["3", "Tasks"], ["4", "Timer"], ["5", "goals"], ["6", "History"], ["7", "Analytics"]]) {
    assert.ok(appSource.includes(`"${key}": "${view}"`), `shortcut ${key} must target ${view}`);
  }
  assert.ok(appSource.includes('key === "b"'), "a shortcut must toggle the sidebar");
  assert.ok(appSource.includes("context.toggleSidebar()"), "the shortcut must reach the toggle handler");
});

test("collapsed rail rules stay scoped to desktop and keep icons centered", () => {
  const desktopStart = cssSource.indexOf("@media (min-width: 900px)");
  assert.ok(desktopStart !== -1, "desktop layout must exist");
  for (const needle of [".sidebar.collapsed", ".sidebar.collapsed .sidebar-item"]) {
    const at = cssSource.indexOf(needle);
    assert.ok(at > desktopStart, `${needle} must not leak into the mobile bottom bar`);
  }
  assert.ok(cssSource.includes("width: 64px"), "collapsed rail keeps a fixed narrow width");
  assert.ok(
    cssSource.includes(".sidebar.collapsed .sidebar-item > span:not(.sidebar-shortcut)"),
    "collapsed labels must hide while icons remain",
  );
  assert.ok(
    cssSource.includes(".sidebar.collapsed .sidebar-shortcut"),
    "collapsed shortcut hints must hide",
  );
  assert.ok(
    cssSource.includes(".sidebar.collapsed .sidebar-collapse"),
    "collapse control must recenter on the narrow rail",
  );
  // Mobile bottom bar never shows the collapse control.
  const collapseBase = cssSource.indexOf(".sidebar-collapse {");
  assert.ok(collapseBase !== -1 && collapseBase < desktopStart, "collapse control defaults to hidden");
  assert.ok(cssSource.includes("display: none;\n}"), "hidden default must exist before desktop rules");
});

test("keyboard focus stays visible on sidebar items", () => {
  assert.ok(cssSource.includes(".sidebar-item:focus-visible"), "sidebar items must show a focus ring");
  assert.ok(cssSource.includes(".sidebar-collapse:focus-visible"), "collapse control must show a focus ring");
});
