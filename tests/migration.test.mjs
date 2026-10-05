import assert from "node:assert/strict";
import { test } from "node:test";
import { runMigration } from "../src/utils/migration.ts";

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

test("migrates Programs and linked habits once without creating Tasks or Milestones", () => {
  const legacyPrograms = [
    { id: 7, name: "Reading Sprint", startDate: "2025-03-01", durationDays: 21, createdAt: "2025-02-28T12:00:00.000Z" },
    { id: 8, name: "Unlinked Program", startDate: "2025-04-01", durationDays: 5 },
  ];
  const legacyHabits = [
    {
      id: 101,
      name: "Read a chapter",
      createdAt: "2025-02-20",
      priority: "Mandatory",
      type: "Challenge",
      programId: 7,
      frequencyType: "weekdays",
      completedDates: ["2025-03-01", "2025-03-03"],
      isArchived: false,
    },
    {
      id: 102,
      name: "Standalone Challenge",
      createdAt: "2025-02-15",
      priority: "Optional",
      type: "Challenge",
      startDate: "2025-02-16",
      durationDays: 3,
      completedDates: ["2025-02-17"],
    },
    {
      id: 103,
      name: "Existing Daily",
      createdAt: "2025-01-01",
      priority: "Optional",
      type: "Daily",
      completedDates: ["2025-01-02"],
    },
  ];
  const projects = [{ id: "existing", name: "Existing Project", status: "active", createdAt: "2025-01-01" }];
  const initial = {
    programs: JSON.stringify(legacyPrograms),
    habits: JSON.stringify(legacyHabits),
    projects: JSON.stringify(projects),
    tasks: JSON.stringify([{ id: "task-1", title: "Keep me" }]),
    milestones: JSON.stringify([{ id: "milestone-1", title: "Keep me", completed: false }]),
  };

  withStorage(initial, (storage) => {
    runMigration();
    const migratedProjects = JSON.parse(storage.getItem("projects"));
    const migratedHabits = JSON.parse(storage.getItem("habits"));

    assert.deepEqual(migratedProjects.map(({ id, name, startDate }) => [id, name, startDate]), [
      ["existing", "Existing Project", undefined],
      ["migrated-7", "Reading Sprint", "2025-03-01"],
      ["migrated-8", "Unlinked Program", "2025-04-01"],
    ]);
    assert.equal(migratedProjects[1].description, "Migrated from a 21-day Program.");
    assert.equal(migratedProjects[1].createdAt, "2025-02-28T12:00:00.000Z");
    assert.equal(migratedProjects[2].createdAt, "2025-04-01");
    assert.deepEqual(migratedHabits.map(({ id, name, createdAt, completedDates, type }) =>
      [id, name, createdAt, completedDates, type]), [
      [101, "Read a chapter", "2025-02-20", ["2025-03-01", "2025-03-03"], "Daily"],
      [102, "Standalone Challenge", "2025-02-15", ["2025-02-17"], "Daily"],
      [103, "Existing Daily", "2025-01-01", ["2025-01-02"], "Daily"],
    ]);
    assert.equal(migratedHabits[0].frequencyType, "weekdays");
    assert.equal(migratedHabits[0].priority, "Mandatory");
    assert.equal("programId" in migratedHabits[0], false);
    assert.equal("startDate" in migratedHabits[1], false);
    assert.deepEqual(JSON.parse(storage.getItem("tasks")), [{ id: "task-1", title: "Keep me" }]);
    assert.deepEqual(JSON.parse(storage.getItem("milestones")), [{ id: "milestone-1", title: "Keep me", completed: false }]);
    assert.equal(storage.getItem("programs"), null);
    assert.equal(storage.getItem("legacyProgramsBackup"), initial.programs);

    runMigration();
    assert.equal(JSON.parse(storage.getItem("projects")).length, 3);
    assert.equal(JSON.parse(storage.getItem("habits")).length, 3);
  });
});

test("does not remove malformed source data or mark a failed migration complete", () => {
  withStorage({ programs: "{broken", habits: "[]" }, (storage) => {
    assert.throws(() => runMigration());
    assert.equal(storage.getItem("programs"), "{broken");
    assert.equal(storage.getItem("migrationVersion"), null);
  });
});

test("retains an existing migrated Project without duplicating it", () => {
  withStorage({
    programs: JSON.stringify([{ id: 3, name: "Old Program", startDate: "2024-01-01", durationDays: 10 }]),
    habits: "[]",
    projects: JSON.stringify([{ id: "migrated-3", name: "Keep Existing Project", createdAt: "2024-01-02", status: "active" }]),
  }, (storage) => {
    runMigration();
    const projects = JSON.parse(storage.getItem("projects"));
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "Keep Existing Project");
    assert.equal(storage.getItem("legacyProgramsBackup") !== null, true);
  });
});

test("does not overwrite a different legacy backup or remove the source", () => {
  withStorage({
    programs: JSON.stringify([{ id: 4, name: "Keep Me", startDate: "2024-02-01", durationDays: 4 }]),
    habits: "[]",
    projects: "[]",
    legacyProgramsBackup: "older backup",
  }, (storage) => {
    assert.throws(() => runMigration(), /backup already exists/);
    assert.notEqual(storage.getItem("programs"), null);
    assert.equal(storage.getItem("legacyProgramsBackup"), "older backup");
    assert.equal(storage.getItem("projects"), "[]");
    assert.equal(storage.getItem("habits"), "[]");
    assert.equal(storage.getItem("migrationVersion"), null);
  });
});
