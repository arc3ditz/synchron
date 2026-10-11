import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getHabitPeriodStreak, queryAnalyticsData } from "../src/domain/analytics.ts";
import { selectTodayMandatoryHabits } from "../src/domain/today.ts";
import { runMigration } from "../src/utils/migration.ts";
import { loadHabits } from "../src/utils/storage.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const todaySource = readFileSync(path.join(root, "src/components/Today.tsx"), "utf8");
const historySource = readFileSync(path.join(root, "src/components/History.tsx"), "utf8");
const analyticsSource = readFileSync(path.join(root, "src/components/Analytics.tsx"), "utf8");
const todayKey = "2026-10-11";
const now = new Date(2026, 9, 11, 12);

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function withStorage(values, callback) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  globalThis.localStorage = storage;
  try {
    callback(storage);
  } finally {
    delete globalThis.localStorage;
  }
}

function makeHabit(id, priority, overrides = {}) {
  return {
    id,
    name: `${priority} ${id}`,
    createdAt: todayKey,
    priority,
    type: "Daily",
    completedDates: [],
    ...overrides,
  };
}

test("Today selects mandatory habits for mandatory-only, optional-only, mixed, and empty collections", () => {
  const mandatory = makeHabit(1, "Mandatory");
  const optional = makeHabit(2, "Optional");
  const completedMandatory = makeHabit(3, "Mandatory", { completedDates: [todayKey] });

  assert.deepEqual(selectTodayMandatoryHabits([mandatory], todayKey), [mandatory]);
  assert.deepEqual(selectTodayMandatoryHabits([optional], todayKey), []);
  assert.deepEqual(
    selectTodayMandatoryHabits([optional, mandatory, completedMandatory], todayKey),
    [mandatory, completedMandatory],
  );
  assert.deepEqual(selectTodayMandatoryHabits([], todayKey), []);
});

test("optional habits never enter Today habit progress or empty-state fallback", () => {
  const optionalDone = makeHabit(2, "Optional", { completedDates: [todayKey] });
  const todayHabits = selectTodayMandatoryHabits([optionalDone], todayKey);
  const completedHabitCount = todayHabits.filter((habit) => habit.completedDates.includes(todayKey)).length;

  assert.equal(todayHabits.length, 0);
  assert.equal(completedHabitCount, 0);
  assert.ok(todaySource.includes("habits: todayHabits"), "recommendations use the same filtered list");
  assert.ok(todaySource.includes("calculateHabitSummary(todayHabits, todayKey)"), "habit progress is calculated from only Today habits");
  assert.ok(todaySource.includes("Your optional habits remain available in My Habits."));
  assert.ok(todaySource.includes("No mandatory habits yet."));
});

test("habit creation and editing preserve the selected classification", () => {
  const createHabit = appSource.slice(
    appSource.indexOf("function addHabit()"),
    appSource.indexOf("function toggleHabit(", appSource.indexOf("function addHabit()")),
  );
  const saveEdit = appSource.slice(
    appSource.indexOf("function saveEdit("),
    appSource.indexOf("function addFocusSessionRecord(", appSource.indexOf("function saveEdit(")),
  );
  assert.match(createHabit, /priority:\s*newPriority/);
  assert.match(saveEdit, /priority:\s*editingPriority/);
  assert.match(appSource, /setEditingPriority\(habit\.priority\)/);
  assert.match(appSource, /<option value="Optional">Optional<\/option>[\s\S]*?<option value="Mandatory">Mandatory<\/option>/);
});

test("storage loading preserves both classifications without reclassifying optional habits", () => {
  const savedHabits = [
    makeHabit(1, "Mandatory"),
    makeHabit(2, "Optional", { completedDates: [todayKey] }),
  ];
  withStorage({ habits: JSON.stringify(savedHabits) }, () => {
    const loaded = loadHabits();
    assert.deepEqual(loaded.map((habit) => habit.priority), ["Mandatory", "Optional"]);
    assert.deepEqual(loaded.map((habit) => habit.completedDates), [[], [todayKey]]);
  });
});

test("migration preserves explicit habit classification", () => {
  const savedHabits = [
    { ...makeHabit(1, "Mandatory"), type: "Challenge" },
    { ...makeHabit(2, "Optional"), type: "Daily" },
  ];
  withStorage({ habits: JSON.stringify(savedHabits) }, (storage) => {
    runMigration();
    const migrated = JSON.parse(storage.getItem("habits"));
    assert.deepEqual(migrated.map((habit) => habit.priority), ["Mandatory", "Optional"]);
    assert.deepEqual(migrated.map((habit) => habit.type), ["Daily", "Daily"]);
  });
});

test("History and Analytics receive optional habits and retain their scheduled completions", () => {
  const optional = makeHabit(2, "Optional", { completedDates: [todayKey] });
  const dataset = queryAnalyticsData({
    habits: [optional],
    tasks: [],
    focusSessions: [],
    horizon: "This Week",
    weekStart: "Monday",
    dayResetHour: 0,
    now,
  });

  assert.equal(dataset.habits[0].priority, "Optional");
  assert.deepEqual(
    dataset.habitOccurrences.map(({ habit, dateKey, completed }) => [habit.id, dateKey, completed]),
    [[2, todayKey, true]],
  );
  assert.equal(getHabitPeriodStreak(dataset, optional, false), 1);
  assert.match(historySource, /\{habits\.map\(\(habit\) =>/);
  assert.match(analyticsSource, /queryAnalyticsData\(\{\s*habits,/);
  assert.match(appSource, /<History\s+habits=\{habits\}/);
  assert.match(appSource, /<Analytics\s+habits=\{habits\}/);
});

test("My Habits starts with all priority values available instead of hiding optional habits", () => {
  const filteredHabits = appSource.slice(
    appSource.indexOf("const filteredHabits = habits.filter"),
    appSource.indexOf("const activeHabits", appSource.indexOf("const filteredHabits = habits.filter")),
  );
  assert.ok(!filteredHabits.includes("filterPriority"), "priority filtering remains user-controlled");
  assert.ok(appSource.includes('useState<"All" | "Mandatory" | "Optional">("All")'));
});
