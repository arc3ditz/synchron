import type { Milestone, Task } from "../types";

export function createTask(data: Omit<Task, "id" | "createdAt" | "completed">): Task {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    completed: false,
  };
}

export function toggleTaskCompletion(task: Task): Task {
  return { ...task, completed: !task.completed };
}

/**
 * Idempotent completion for the Task ↔ Focus flow: completing an already
 * completed Task is a no-op. Never toggles back to incomplete.
 */
export function completeTask(task: Task): Task {
  if (task.completed) return task;
  return { ...task, completed: true };
}

export function updateTask(
  task: Task,
  data: Omit<Task, "id" | "createdAt" | "completed">,
): Task {
  return { ...task, ...data };
}

export function deleteTask(tasks: Task[], taskId: string): Task[] {
  return tasks.filter((task) => task.id !== taskId);
}

export function filterTasksByGoal(tasks: Task[], goalId: string): Task[] {
  return tasks.filter((task) => task.goalId === goalId);
}

export function filterTasksByMilestone(tasks: Task[], milestoneId: string): Task[] {
  return tasks.filter((task) => task.milestoneId === milestoneId);
}

export function filterTasksForFocusSelection(
  tasks: Task[],
  goalId: string,
  milestoneId: string,
): Task[] {
  if (milestoneId) return filterTasksByMilestone(tasks, milestoneId);
  if (!goalId) return [];
  return tasks.filter((task) => task.goalId === goalId && !task.milestoneId);
}

const TASK_PRIORITY_RANK: Record<Task["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Lexicographic comparison works for "YYYY-MM-DD" calendar keys.
 * A Task with no dueDate is never overdue.
 */
export function isTaskOverdue(task: Pick<Task, "dueDate">, todayKey: string): boolean {
  return task.dueDate !== undefined && task.dueDate < todayKey;
}

export function isTaskDueTodayOrOverdue(task: Pick<Task, "dueDate">, todayKey: string): boolean {
  return task.dueDate !== undefined && task.dueDate <= todayKey;
}

/**
 * Single Today membership definition for Tasks: due today or overdue, or
 * attached to an active Milestone. Completed Tasks stay included so Today can
 * show (and reopen) what was finished; callers split pending/completed.
 * Future-due Tasks without an active Milestone stay out of Today.
 */
export function selectTodayTasks(
  tasks: Task[],
  input: { milestones: Pick<Milestone, "id" | "goalId" | "completed">[]; activeGoalIds: ReadonlySet<string>; todayKey: string },
): Task[] {
  const activeMilestoneIds = new Set(
    input.milestones
      .filter((milestone) =>
        !milestone.completed &&
        milestone.goalId !== undefined &&
        input.activeGoalIds.has(milestone.goalId),
      )
      .map((milestone) => milestone.id),
  );
  return tasks.filter((task) =>
    isTaskDueTodayOrOverdue(task, input.todayKey) ||
    (task.milestoneId !== undefined && activeMilestoneIds.has(task.milestoneId)),
  );
}

/**
 * Deterministic Today ordering: overdue first, then due today, then Tasks
 * relevant only through an active Milestone; ties break by priority
 * (high → medium → low) and then creation order.
 */
export function sortTodayTasks<T extends Pick<Task, "dueDate" | "priority" | "createdAt">>(
  tasks: T[],
  todayKey: string,
): T[] {
  return [...tasks].sort((a, b) => {
    const aOverdue = isTaskOverdue(a, todayKey) ? 0 : 1;
    const bOverdue = isTaskOverdue(b, todayKey) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    const aDue = a.dueDate ?? "\uffff";
    const bDue = b.dueDate ?? "\uffff";
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;
    const priority = TASK_PRIORITY_RANK[a.priority] - TASK_PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export interface TaskContext {
  goal?: { id: string; title: string };
  project?: { id: string; name: string };
  milestone?: { id: string; title: string };
}

/**
 * Resolve a Task's display hierarchy without duplicating relationship info:
 * the Milestone remains the source of truth for Project/Goal inheritance
 * (see relationships.ts), so context falls back through the Milestone when
 * the Task itself carries no direct link.
 */
export function resolveTaskContext(
  task: Pick<Task, "goalId" | "projectId" | "milestoneId">,
  input: {
    goals: { id: string; title: string }[];
    projects?: { id: string; name: string }[];
    milestones: { id: string; title: string; goalId?: string; projectId?: string }[];
  },
): TaskContext {
  const milestone = task.milestoneId !== undefined
    ? input.milestones.find((item) => item.id === task.milestoneId)
    : undefined;
  const projectId = task.projectId ?? milestone?.projectId;
  const project = projectId !== undefined
    ? input.projects?.find((item) => item.id === projectId)
    : undefined;
  const goalId = task.goalId ?? milestone?.goalId;
  const goal = goalId !== undefined
    ? input.goals.find((item) => item.id === goalId)
    : undefined;
  return { goal, project, milestone };
}