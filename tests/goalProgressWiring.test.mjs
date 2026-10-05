import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const goalsSource = readFileSync(path.join(root, "src/components/Goals.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");

const EXPECTED_CALL =
  "calculateGoalProgress(goal, milestones, tasks, habits, streakFreeze, dayResetHour, projects)";

test("Goals page passes Projects to the shared Goal progress calculation", () => {
  assert.ok(
    goalsSource.includes(EXPECTED_CALL),
    "Goals.tsx must call calculateGoalProgress with the projects argument",
  );
});

test("Today passes Projects to the shared Goal progress calculation", () => {
  assert.ok(
    todaySource.includes(EXPECTED_CALL),
    "Today.tsx must call calculateGoalProgress with the projects argument",
  );
});

test("Today and Goals use the same single progress calculation", () => {
  const countOccurrences = (source) =>
    source.split("calculateGoalProgress(").length - 1;
  // Exactly one shared implementation exists in the domain layer and each
  // view calls it exactly once with the same argument list.
  assert.equal(countOccurrences(goalsSource), 1);
  assert.equal(countOccurrences(todaySource), 1);
  assert.ok(goalsSource.includes("from \"../domain/goals\""));
  assert.ok(todaySource.includes("from \"../domain/goals\""));
});

test("Goal detail view lets a Project be added inside its Goal", () => {
  assert.ok(
    goalsSource.includes("onAddProject"),
    "Goals.tsx must accept an onAddProject handler",
  );
  assert.ok(
    goalsSource.includes("Add Project"),
    "Goal cards must offer project creation scoped to the Goal",
  );
});

test("App wires the same add-project handler to Goals and Projects", () => {
  const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.ok(
    appSource.includes("function handleAddProject("),
    "App must define one shared handleAddProject",
  );
  assert.ok(
    appSource.includes("onAddProject={handleAddProject}"),
    "App must pass the shared handler to the views",
  );
});

test("Projects is no longer a top-level sidebar item but stays reachable from Goals", () => {
  const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.ok(
    !appSource.includes("<span>Projects</span>"),
    "Sidebar must not list Projects as top-level navigation",
  );
  for (const label of ["Today", "My Habits", "Timer", "Goals", "History", "Analytics", "Settings"]) {
    assert.ok(appSource.includes(`<span>${label}</span>`), `Sidebar must keep ${label}`);
  }
  // The Projects view itself is preserved for Goal-scoped access.
  assert.ok(appSource.includes('navigateToView("Projects")'), "Goal open-project navigation must remain");
  assert.ok(!appSource.includes('"4": "Projects"'), "No keyboard shortcut may target a top-level Projects view");
});
