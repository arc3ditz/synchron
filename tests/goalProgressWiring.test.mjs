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
