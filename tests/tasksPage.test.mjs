import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");
const typesSource = readFileSync(path.join(root, "src/types/index.ts"), "utf8");

test("sidebar order is Today, My Habits, Tasks, Timer, Projects, History, Analytics", () => {
  const order = ["Today", "My Habits", "Tasks", "Timer", "Projects", "History", "Analytics"]
    .map((label) => appSource.indexOf(`<span>${label}</span>`));
  for (const [index, position] of order.entries()) {
    assert.ok(position !== -1, `sidebar must contain ${["Today", "My Habits", "Tasks", "Timer", "Projects", "History", "Analytics"][index]}`);
    if (index > 0) assert.ok(position > order[index - 1], "sidebar items must follow the required order");
  }
});

test("Tasks is a real view wired to the existing Task handlers", () => {
  assert.ok(typesSource.includes('"Tasks"'), "View union must include Tasks");
  assert.ok(appSource.includes('navigateToView("Tasks")'), "sidebar must navigate to Tasks");
  assert.ok(appSource.includes('view === "Tasks"'), "Tasks view must be mounted");
  assert.ok(appSource.includes("<Tasks"), "App must render the Tasks page");
  for (const handler of ["onAddTask={handleAddTask}", "onEditTask={handleEditTask}", "onDeleteTask={handleDeleteTask}", "onToggleTask={handleToggleTask}"]) {
    const occurrences = appSource.split(handler).length - 1;
    assert.ok(occurrences >= 2, `${handler} must stay shared across Projects and Tasks (found ${occurrences})`);
  }
});

test("keyboard shortcuts follow sidebar order including Projects", () => {
  for (const [key, view] of [["1", "Today"], ["2", "Habits"], ["3", "Tasks"], ["4", "Timer"], ["5", "Projects"], ["6", "History"], ["7", "Analytics"]]) {
    assert.ok(appSource.includes(`"${key}": "${view}"`), `shortcut ${key} must target ${view}`);
  }
  assert.ok(appSource.includes("<span>Projects</span>"), "Projects must be in top-level navigation");
});

test("Tasks page manages the full lifecycle through existing mechanisms", () => {
  assert.ok(tasksSource.includes("onAddTask({"), "Add uses the shared creation handler");
  assert.ok(tasksSource.includes("onEditTask(task.id,"), "Edit uses the shared edit handler");
  assert.ok(tasksSource.includes("onDeleteTask(pendingDeletion.id)"), "Delete uses the shared deletion handler");
  assert.ok(tasksSource.includes("onToggleTask(task.id)"), "Complete/uncomplete uses the shared toggle handler");
  assert.ok(tasksSource.includes("resolveTaskContext"), "rows show Project / Milestone context");
  assert.ok(tasksSource.includes("No tasks yet"), "page has a useful empty state");
});

test("Tasks page reuses design tokens (dark/light safe, no hardcoded colors)", () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(tasksSource), "no hardcoded hex colors");
  assert.ok(!/(^|[^\w-])rgba?\(/.test(tasksSource), "no hardcoded rgb colors");
  assert.ok(tasksSource.includes("var(--"), "uses Synchron CSS variables");
});
