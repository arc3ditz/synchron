import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

function section(source, start, end = "\n  }") {
  const idx = source.indexOf(start);
  assert.ok(idx >= 0, `expected block ${start}`);
  const tail = source.slice(idx);
  const close = tail.indexOf(end);
  assert.ok(close >= 0, `expected terminator for ${start}`);
  return tail.slice(0, close + end.length);
}

// --- Quick creation: minimal keys, minimal inputs ---

test("habit name input saves on Enter without extra clicks", () => {
  assert.ok(appSource.includes('aria-label="New habit name"'), "name input stays labelled and findable");
  assert.ok(
    appSource.includes('if (event.key === "Enter") addHabit()'),
    "Enter in the name field saves immediately",
  );
});

test("primary creation path is Name + Frequency; the rest is optional", () => {
  assert.ok(appSource.includes("More options"), "advanced settings hide behind one disclosure");
  assert.ok(appSource.includes("showHabitOptions"), "disclosure is local UI state, not new storage");
  assert.ok(appSource.includes("Fewer options"), "disclosure collapses back");
  const addHabit = section(appSource, "function addHabit()");
  assert.ok(addHabit.includes("const name = newHabit.trim()"), "blank names still rejected");
  assert.ok(addHabit.includes("frequencyType: newFrequencyType"), "frequency default preserved");
  assert.ok(addHabit.includes("priority: newPriority"), "priority default preserved");
  assert.ok(addHabit.includes("completedDates: []"), "new habits start incomplete");
  for (const prop of ["targetCount", "complexity", "milestoneId", "estimatedMinutes"]) {
    assert.ok(!addHabit.includes(prop), `creation must not gain ${prop}`);
  }
  // Optional Project association is the one sanctioned exception: it stays out
  // of the primary path (behind More options), defaults to none, and is only
  // attached when the picker names an existing Project.
  assert.ok(addHabit.includes("newProjectId"), "optional project link is creation-time state");
  assert.ok(
    addHabit.includes('newProjectId !== ""') && addHabit.includes("projects.some"),
    "project link defaults to standalone and validates the target exists",
  );
});

// --- Finding habits: lightweight text search, no new metadata ---

test("habit search filters by name without new properties or filters", () => {
  assert.ok(appSource.includes('aria-label="Search habits"'), "search input is labelled");
  assert.ok(
    appSource.includes("habit.name.toLowerCase().includes(searchQuery)"),
    "matching is a case-insensitive name substring",
  );
  assert.ok(appSource.includes("const [habitSearch, setHabitSearch] = useState"), "query is ephemeral UI state");
  const clearer = section(appSource, "const clearPropertyFilters");
  assert.ok(clearer.includes('setHabitSearch("")'), "resetting filters also clears the query");
  assert.ok(
    appSource.includes('searchQuery !== ""') && appSource.includes("No habits match these filters."),
    "search-only dead ends explain themselves with a reset path",
  );
});

// --- Pause, resume, and daily action stay one click away ---

test("pausing and resuming a habit stay single actions", () => {
  assert.ok(appSource.includes("onClick={() => archiveHabit(habit.id)}"), "pause is one click on the row");
  assert.ok(appSource.includes("onClick={() => unarchiveHabit(habit.id)}"), "resume is one click in the archived section");
  assert.ok(appSource.includes("Show Archived Habits") || appSource.includes("Archived Habits ("), "archived habits stay reachable in place");
});

test("habits due today stay visually separated from off-day habits", () => {
  assert.ok(appSource.includes("Not Scheduled Today"), "off-day section keeps its heading");
  assert.ok(appSource.includes("const activeHabits = filteredHabits.filter("), "today membership still derives from schedule math");
});

test("completing a habit is a single toggle from either layout", () => {
  const row = section(appSource, "function renderHabitRow(");
  assert.ok(row.includes("onClick={() => toggleHabit(habit.id)}"), "list rows complete in one click");
  const card = section(appSource, "function renderHabitGridCard(");
  assert.ok(card.includes("onClick={() => toggleHabit(habit.id)}"), "grid cards complete in one click");
});
