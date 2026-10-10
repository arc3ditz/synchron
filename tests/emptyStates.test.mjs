import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const tasksSource = readFileSync(path.join(root, "src/components/Tasks.tsx"), "utf8");
const goalsSource = readFileSync(path.join(root, "src/components/Goals.tsx"), "utf8");

// --- Fresh install: one obvious action, existing creation paths only ---

test("Today fresh-install state leads with a single inline task action", () => {
  assert.ok(
    todaySource.includes("todayHabits.length === 0 && todayTasks.length === 0 && activeGoals.length === 0"),
    "full empty page only when there is truly nothing to show",
  );
  assert.ok(todaySource.includes("plan your first win"), "headline stays encouraging, never technical");
  assert.ok(todaySource.includes('placeholder="Add a Task for Today"'), "primary action is the existing inline task form");
  assert.ok(todaySource.includes("New Habit") && todaySource.includes("Start Focus"), "secondary paths reuse existing navigation");
  assert.ok(!todaySource.includes("wizard") && !todaySource.includes("carousel"), "no setup wizard machinery");
});

// --- Partial empties: vacant lines now name the next action ---

test("Today partial empties point at the next useful action", () => {
  assert.ok(
    todaySource.includes("No tasks for today. Add one small task above"),
    "empty task list points to the quick-add form directly above it",
  );
  assert.ok(
    todaySource.includes("No habits scheduled for today."),
    "habit empty line keeps its calm base copy",
  );
  assert.ok(
    todaySource.includes("Start one small habit →"),
    "empty habit list offers one inline creation path",
  );
  assert.ok(
    todaySource.includes("onClick={onNavigateToHabits}"),
    "habit empty action reuses existing navigation, not a new modal",
  );
});

// --- My Habits / Tasks: title-only start, optionals deferred in words ---

test("Habits empty state asks for a name first, defers optional config", () => {
  assert.ok(appSource.includes("No habits yet — name your first small habit above."));
  assert.ok(appSource.includes("Frequency, category, and goals can come later"));
});

test("Tasks empty state keeps its contract and lowers the bar to a title", () => {
  assert.ok(tasksSource.includes("No tasks yet"), "existing empty-state contract preserved");
  assert.ok(tasksSource.includes("just a title is enough to get started"));
  assert.ok(tasksSource.includes("No tasks match your filter"), "filtered empty stays distinct from true empty");
});

// --- Goals: one small goal first; structure marked optional ---

test("Goals empty states keep optionals out of the primary path", () => {
  assert.ok(goalsSource.includes("No active goals yet"));
  assert.ok(goalsSource.includes("Create one small goal to start"));
  assert.ok(goalsSource.includes("projects and checkpoints are optional and can wait"));
  assert.ok(goalsSource.includes("Optional: group work into a project when this grows"));
  assert.ok(goalsSource.includes("Optional: add a checkpoint when you"));
  assert.ok(
    goalsSource.includes("Connect daily habits to track progress"),
    "linking a habit stays the primary in-card next action",
  );
});

// --- All-done and behind states stay calm and pressure-free ---

test("completion and backlog copy stays encouraging, never shaming", () => {
  assert.ok(todaySource.includes("All clear for today. Nicely done."));
  const renderedCopy = todaySource
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{[^}]*\}/g, "");
  assert.ok(!/behind|missed|failed|lazy/i.test(renderedCopy), "rendered Today copy never scolds for missed days");
  assert.ok(
    todaySource.includes("Backlog since") || appSource.includes("Backlog since") || tasksSource.includes("Backlog"),
    "stale work renders as quiet backlog context somewhere in the app",
  );
});
