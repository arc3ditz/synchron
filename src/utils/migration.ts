import type { Habit, Project } from "../types";

const MIGRATION_VERSION_KEY = "migrationVersion";
const CURRENT_MIGRATION_VERSION = 2;
const LEGACY_PROGRAMS_KEY = "programs";
const LEGACY_PROGRAMS_BACKUP_KEY = "legacyProgramsBackup";
const HABITS_KEY = "habits";
const PROJECTS_KEY = "projects";

interface LegacyProgram {
  id: number;
  name: string;
  startDate: string;
  durationDays: number;
  createdAt?: string;
}

type LegacyHabit = Omit<Habit, "type"> & {
  type?: string;
  programId?: number;
  startDate?: string;
  durationDays?: number;
};

export function runMigration(): void {
  const currentVersion = readMigrationVersion();
  if (currentVersion >= CURRENT_MIGRATION_VERSION) return;

  migrateProgramsToProjects();
  writeVerified(MIGRATION_VERSION_KEY, JSON.stringify(CURRENT_MIGRATION_VERSION));
}

function migrateProgramsToProjects(): void {
  const rawPrograms = localStorage.getItem(LEGACY_PROGRAMS_KEY);
  if (rawPrograms === null) {
    normalizeLegacyHabits();
    return;
  }

  const programs = parsePrograms(rawPrograms);
  const rawHabits = localStorage.getItem(HABITS_KEY);
  const habits = parseHabits(rawHabits);
  const rawProjects = localStorage.getItem(PROJECTS_KEY);
  const existingProjects = parseProjects(rawProjects);
  const existingIds = new Set(existingProjects.map((project) => project.id));
  const existingBackup = localStorage.getItem(LEGACY_PROGRAMS_BACKUP_KEY);
  if (existingBackup !== null && existingBackup !== rawPrograms) {
    throw new Error("A different legacy Programs backup already exists; source data was retained.");
  }

  const migratedProjects = programs.flatMap((program): Project[] => {
    const id = `migrated-${program.id}`;
    if (existingIds.has(id)) return [];

    existingIds.add(id);
    return [{
      id,
      name: program.name,
      description: `Migrated from a ${program.durationDays}-day Program.`,
      startDate: program.startDate,
      status: "planned",
      createdAt: typeof program.createdAt === "string"
        ? program.createdAt
        : program.startDate,
    }];
  });

  const migratedHabits = habits.map(toDailyHabit);

  if (migratedProjects.length > 0) {
    writeVerified(PROJECTS_KEY, JSON.stringify([...existingProjects, ...migratedProjects]));
  }
  if (JSON.stringify(migratedHabits) !== JSON.stringify(habits)) {
    writeVerified(HABITS_KEY, JSON.stringify(migratedHabits));
  }

  // Keep an exact copy until all migrated records have been written and verified.
  if (existingBackup === null) writeVerified(LEGACY_PROGRAMS_BACKUP_KEY, rawPrograms);
  if (localStorage.getItem(LEGACY_PROGRAMS_KEY) !== rawPrograms) {
    throw new Error("Legacy Programs changed during migration; source data was retained.");
  }
  localStorage.removeItem(LEGACY_PROGRAMS_KEY);
}

function normalizeLegacyHabits(): void {
  const rawHabits = localStorage.getItem(HABITS_KEY);
  const habits = parseHabits(rawHabits);
  const normalized = habits.map(toDailyHabit);

  if (JSON.stringify(normalized) !== JSON.stringify(habits)) {
    writeVerified(HABITS_KEY, JSON.stringify(normalized));
  }
}

function readMigrationVersion(): number {
  const raw = localStorage.getItem(MIGRATION_VERSION_KEY);
  if (raw === null) return 0;
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Invalid migration version; migration was not run.");
  }
  return parsed;
}

function parsePrograms(raw: string): LegacyProgram[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Legacy Programs data is not an array; migration was not run.");
  return parsed.map((item: unknown) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Legacy Program data is invalid; migration was not run.");
    }
    const program = item as {
      id?: unknown;
      name?: unknown;
      startDate?: unknown;
      durationDays?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof program.id !== "number" ||
      typeof program.name !== "string" ||
      typeof program.startDate !== "string" ||
      typeof program.durationDays !== "number"
    ) {
      throw new Error("Legacy Program data is invalid; migration was not run.");
    }
    return {
      id: program.id,
      name: program.name,
      startDate: program.startDate,
      durationDays: program.durationDays,
      ...(typeof program.createdAt === "string" ? { createdAt: program.createdAt } : {}),
    };
  });
}

function toDailyHabit(habit: LegacyHabit): Habit {
  const habitData = { ...habit };
  delete habitData.type;
  delete habitData.programId;
  delete habitData.startDate;
  delete habitData.durationDays;
  return { ...habitData, type: "Daily" };
}

function parseHabits(raw: string | null): LegacyHabit[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Stored Habits data is not an array; migration was not run.");
  if (parsed.some((item) =>
    typeof item !== "object" || item === null ||
    typeof item.id !== "number" || typeof item.name !== "string"
  )) {
    throw new Error("Stored Habit data is invalid; migration was not run.");
  }
  return parsed as LegacyHabit[];
}

function parseProjects(raw: string | null): Project[] {
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Stored Projects data is not an array; migration was not run.");
  if (parsed.some((item) =>
    typeof item !== "object" || item === null ||
    typeof item.id !== "string" || typeof item.name !== "string"
  )) {
    throw new Error("Stored Project data is invalid; migration was not run.");
  }
  return parsed as Project[];
}

function writeVerified(key: string, value: string): void {
  localStorage.setItem(key, value);
  if (localStorage.getItem(key) !== value) {
    throw new Error(`Could not verify migrated data in storage key "${key}".`);
  }
}
