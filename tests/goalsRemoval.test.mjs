import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { selectTodayTasks } from "../src/domain/tasks.ts";
import { filterTasksForFocusSelection } from "../src/domain/tasks.ts";
import { recommendNextStep } from "../src/domain/nextStep.ts";
import { normalizeRelationships, alignProject } from "../src/domain/relationships.ts";
import { loadTasks } from "../src/utils/storage.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const typesSource = readFileSync(path.join(root, "src/types/index.ts"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const projectsSource = readFileSync(path.join(root, "src/components/Projects.tsx"), "utf8");
const focusSource = readFileSync(path.join(root, "src/components/FocusTimer.tsx"), "utf8");

const TODAY = "2026-10-09";

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    title: "Task",
    completed: false,
    priority: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// --- Removed workflows ---

test("Goals have no navigation entry, view, palette action, or shortcut", () => {
  assert.ok(!typesSource.includes('"goals"'), "View union must not include goals");
  assert.ok(!appSource.includes('navigateToView("goals")'), "no navigation to goals");
  assert.ok(!appSource.includes("go-goals"), "no go-goals palette command");
  assert.ok(appSource.includes('"go-projects"'), "projects palette command replaces it");
  assert.ok(!appSource.includes("<Goals"), "Goals component is not mounted");
  assert.ok(!appSource.includes("onNavigateToGoals"), "no goals navigation callback");
  assert.ok(!appSource.includes('"5": "goals"'), "no goals keyboard shortcut");
  assert.ok(appSource.includes('"5": "Projects"'), "shortcut 5 targets Projects");
});

test("normal task and habit workflows carry no Goal selectors", () => {
  assert.ok(!tasksSource.includes("Linked Goal"), "Tasks form has no Goal selector");
  assert.ok(!tasksSource.includes("Filter by Goal"), "Tasks filter has no Goal filter");
  assert.ok(!todaySource.includes("onNavigateToGoals"), "Today has no goals navigation");
  assert.ok(!todaySource.includes("renderGoalProgressSnapshot"), "no goal progress snapshot");
  assert.ok(!projectsSource.includes("Linked Goal"), "Projects has no Goal selector");
  assert.ok(!focusSource.includes("Link to Goal"), "Focus timer has no Goal selector");
  assert.ok(!appSource.includes("No Goal — standalone habit"), "habit forms have no Goal option");
});

// --- Preserved behavior ---

test("standalone tasks and habits are fully usable without links", () => {
  const rec = recommendNextStep({
    habits: [{ id: 1, name: "Read", priority: "Optional", type: "Daily", completedDates: [] }],
    tasks: [makeTask({ id: "solo", title: "Solo" })],
    milestones: [],
    projects: [],
    todayKey: TODAY,
  });
  assert.equal(rec.kind, "task");
  assert.equal(rec.taskId, "solo");
  assert.match(rec.reason, /Available task/);
});

test("milestone-linked tasks without any Goal surface in Today", () => {
  const milestones = [{ id: "m-1", title: "Checkpoint", completed: false }];
  const tasks = [makeTask({ id: "t-1", title: "Step", milestoneId: "m-1" })];
  const selected = selectTodayTasks(tasks, { milestones, todayKey: TODAY });
  assert.deepEqual(selected.map((t) => t.id), ["t-1"]);
});

test("focus picker lists work with no Goal selected", () => {
  const tasks = [
    { id: "a", projectId: "p-1", title: "A", completed: false },
    { id: "b", title: "Standalone", completed: false },
  ];
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "", "").map((t) => t.id).sort(),
    ["a", "b"],
  );
  assert.deepEqual(
    filterTasksForFocusSelection(tasks, "", "", "p-1").map((t) => t.id),
    ["a"],
  );
});

test("projects are created and used standalone", () => {
  const project = alignProject({ id: "p-1", name: "P", status: "planned", createdAt: "2025-01-01" });
  assert.equal(project.goalId, undefined);
  assert.ok(projectsSource.includes("Projects are optional"), "projects copy states optionality");
});

test("legacy goalId data is preserved verbatim, never migrated to projects", () => {
  const tasks = [{
    id: "t-1", goalId: "legacy-goal", projectId: "missing", title: "T",
    completed: false, priority: "medium", createdAt: "2025-01-01",
  }];
  const result = normalizeRelationships([], [], tasks);
  assert.equal(result.tasks[0].goalId, "legacy-goal", "legacy link preserved");
  assert.equal(result.tasks[0].projectId, undefined, "no blind migration to project");
});

test("legacy goal-linked tasks still load from storage", () => {
  const stored = [{
    id: "t-1", goalId: "legacy-goal", title: "Linked",
    completed: false, priority: "medium", createdAt: "2025-01-01",
  }];
  const prev = globalThis.localStorage;
  const values = new Map([["tasks", JSON.stringify(stored)]]);
  globalThis.localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: (k) => values.delete(k),
  };
  try {
    const [loaded] = loadTasks();
    assert.equal(loaded.goalId, "legacy-goal");
  } finally {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  }
});
