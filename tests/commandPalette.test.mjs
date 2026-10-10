import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { filterCommands, nextSelectedIndex } from "../src/domain/commandPalette.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const paletteSource = readFileSync(path.join(root, "src/components/CommandPalette.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

const commands = [
  { id: "go-today", label: "Go to Today", hint: "⌘1", keywords: "navigate view" },
  { id: "go-habits", label: "Go to My Habits", hint: "⌘2", keywords: "navigate view habits" },
  { id: "add-task", label: "Add Task", keywords: "create new task today" },
  { id: "start-focus", label: "Start Focus", keywords: "timer pomodoro begin focus" },
];

test("empty query returns every command in order", () => {
  assert.deepEqual(filterCommands(commands, ""), commands);
  assert.deepEqual(filterCommands(commands, "   "), commands);
});

test("filtering is fast substring matching across label, id, and keywords", () => {
  assert.deepEqual(filterCommands(commands, "habit").map((c) => c.id), ["go-habits"]);
  assert.deepEqual(filterCommands(commands, "FOCUS").map((c) => c.id), ["start-focus"]);
  assert.deepEqual(filterCommands(commands, "add").map((c) => c.id), ["add-task"]);
  assert.deepEqual(filterCommands(commands, "go-").map((c) => c.id), ["go-today", "go-habits"]);
  assert.deepEqual(filterCommands(commands, "zzz"), []);
});

test("arrow-key selection wraps around and clamps after filtering", () => {
  assert.equal(nextSelectedIndex(0, 1, 4), 1);
  assert.equal(nextSelectedIndex(3, 1, 4), 0);
  assert.equal(nextSelectedIndex(0, -1, 4), 3);
  assert.equal(nextSelectedIndex(9, 1, 2), 0);
  assert.equal(nextSelectedIndex(-5, -1, 3), 2);
  assert.equal(nextSelectedIndex(0, 1, 0), 0);
});

test("⌘K opens the palette (shortcuts modal moved to ⌘/ — a real conflict)", () => {
  assert.match(appSource, /if \(key === "k"\) \{\s+event\.preventDefault\(\);\s+context\.openPalette\(\);/);
  assert.ok(appSource.includes('if (event.key === "/")'), "⌘/ must open the shortcuts modal");
  const kBlock = appSource.slice(appSource.indexOf('if (key === "k")'), appSource.indexOf('if (event.key === "/")'));
  assert.ok(!kBlock.includes("openShortcuts"), "⌘K must no longer open the shortcuts modal");
});

test("palette renders from App and closes first on Escape", () => {
  assert.ok(appSource.includes("<CommandPalette"), "App must render the palette");
  assert.ok(appSource.includes("paletteOpen && ("), "palette must be conditional");
  assert.match(appSource, /if \(paletteOpen\) \{\s+setPaletteOpen\(false\);/,
    "Escape must close the palette before any other transient UI");
  assert.ok(appSource.includes("shortcutsBlocked: showKeyboardShortcuts || paletteOpen"),
    "open palette must block background shortcuts");
});

test("palette exposes every required action and reuses navigation", () => {
  for (const id of [
    "go-today", "go-habits", "go-timer", "go-projects", "go-history",
    "go-analytics", "open-settings", "add-task", "add-habit", "start-focus",
  ]) {
    assert.ok(appSource.includes(`"${id}"`), `palette must define ${id}`);
  }
  assert.ok(appSource.includes("navigateToView(\"Today\")"), "actions reuse navigateToView");
  assert.ok(appSource.includes("quickTaskFocusRef.current?.()"), "Add Task reuses Today's input");
  assert.ok(appSource.includes("newHabitInputRef.current?.focus()"), "Add Habit reuses the habit input");
});

test("palette keyboard model: arrows, Enter, Escape on its own input", () => {
  assert.ok(paletteSource.includes('"ArrowDown"'), "ArrowDown moves selection");
  assert.ok(paletteSource.includes('"ArrowUp"'), "ArrowUp moves selection");
  assert.ok(paletteSource.includes('"Enter"'), "Enter runs the selection");
  assert.ok(paletteSource.includes('"Escape"'), "Escape closes");
  assert.ok(!paletteSource.includes("addEventListener"), "no global listeners to steal keys");
  assert.ok(paletteSource.includes('role="listbox"'), "options are exposed as a listbox");
});

test("single-key shortcuts still ignore text inputs (no conflicts)", () => {
  assert.ok(appSource.includes('target.matches("input, textarea, select")'),
    "typing guard must remain for single-key shortcuts");
});

test("timeline passes the Task id through to Focus", () => {
  assert.ok(todaySource.includes("buildDailyTimeline"), "Today renders the domain timeline");
  assert.ok(todaySource.includes("taskId: block.taskId"), "scheduled Task keeps its id into Focus");
  assert.ok(todaySource.includes("onQuickTaskFocusReady"), "palette Add Task hooks into Today's input");
});
