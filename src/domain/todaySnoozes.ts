import type { Habit, Milestone, Project, Task } from "../types";

export type TodaySnooze =
  | { kind: "habit"; id: number; returnAt: number }
  | { kind: "task"; id: string; returnAt: number };

export type TodaySnoozeTarget =
  | { kind: "habit"; id: number }
  | { kind: "task"; id: string };

export interface TodaySnoozeEntities {
  habits: (Pick<Habit, "id"> & Partial<Pick<Habit, "isArchived" | "projectId">>)[];
  tasks: (Pick<Task, "id" | "completed"> & Partial<Pick<Task, "projectId" | "milestoneId">>)[];
  milestones: (Pick<Milestone, "id"> & Partial<Pick<Milestone, "projectId">>)[];
  projects: Pick<Project, "id" | "status">[];
}

export const DEFAULT_SNOOZE_RETURN_MINUTES = 240;
export const SNOOZE_RETURN_MINUTES = [30, 60, 120, 240, 480] as const;

export function isTodaySnooze(value: unknown): value is TodaySnooze {
  if (typeof value !== "object" || value === null) return false;
  const snooze = value as Record<string, unknown>;
  return Number.isFinite(snooze.returnAt) &&
    (snooze.kind === "habit"
      ? Number.isInteger(snooze.id)
      : snooze.kind === "task" && typeof snooze.id === "string" && snooze.id !== "");
}

export function getActiveTodaySnoozes(
  snoozes: readonly TodaySnooze[],
  now: number,
): { habitIds: ReadonlySet<number>; taskIds: ReadonlySet<string> } {
  const habitIds = new Set<number>();
  const taskIds = new Set<string>();
  for (const snooze of snoozes) {
    if (snooze.returnAt <= now) continue;
    if (snooze.kind === "habit") habitIds.add(snooze.id);
    else taskIds.add(snooze.id);
  }
  return { habitIds, taskIds };
}

export function pruneIneligibleTodaySnoozes(
  snoozes: readonly TodaySnooze[],
  entities: TodaySnoozeEntities,
): TodaySnooze[] {
  const habitsById = new Map(entities.habits.map((habit) => [habit.id, habit]));
  const projectsById = new Map(entities.projects.map((project) => [project.id, project]));
  const milestonesById = new Map(entities.milestones.map((milestone) => [milestone.id, milestone]));
  const tasksById = new Map(entities.tasks.map((task) => [task.id, task]));

  return snoozes.filter((snooze) => {
    if (snooze.kind === "habit") {
      const habit = habitsById.get(snooze.id);
      return Boolean(habit && !habit.isArchived &&
        (habit.projectId === undefined ||
          projectsById.get(habit.projectId)?.status === "active"));
    }

    const task = tasksById.get(snooze.id);
    if (!task || task.completed) return false;
    const projectId = task.projectId ?? milestonesById.get(task.milestoneId ?? "")?.projectId;
    return projectId === undefined ||
      projectsById.get(projectId)?.status === "active";
  });
}

export function snoozeTodayItem(
  snoozes: readonly TodaySnooze[],
  item: TodaySnoozeTarget,
  now: number,
  returnAfterMinutes: number,
): TodaySnooze[] {
  const returnAt = now + returnAfterMinutes * 60_000;
  const withoutItem = snoozes.filter((snooze) => snooze.kind !== item.kind || snooze.id !== item.id);
  if (item.kind === "habit") return [...withoutItem, { kind: "habit", id: item.id, returnAt }];
  return [...withoutItem, { kind: "task", id: item.id, returnAt }];
}

export function removeTodaySnooze(
  snoozes: TodaySnooze[],
  item: TodaySnoozeTarget,
): TodaySnooze[] {
  const remaining = snoozes.filter((snooze) => snooze.kind !== item.kind || snooze.id !== item.id);
  return remaining.length === snoozes.length ? snoozes : remaining;
}
