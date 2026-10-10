import type { Goal, Habit, Milestone, Project, Task } from "../types";
import { isTaskDueTodayOrOverdue, isTaskOverdue } from "./tasks.ts";
import { timeToMinutes } from "./timeline.ts";
import { diffInDays, isHabitScheduledOnDate } from "../utils/dates.ts";

export const STALE_OVERDUE_DAYS = 7;

export type NextStepKind = "task" | "habit" | "none";

export interface NextStepTaskRecommendation {
  kind: "task";
  taskId: string;
  title: string;
  reason: string;
  durationMinutes?: number;
  dueDate?: string;
  scheduledTime?: string;
  priority: Task["priority"];
  overdue: boolean;
}

export interface NextStepHabitRecommendation {
  kind: "habit";
  habitId: number;
  title: string;
  reason: string;
  durationMinutes?: number;
  scheduledTime?: string;
  priority: Habit["priority"];
}

export interface NextStepFallback {
  kind: "none";
  title: string;
  reason: string;
}

export type NextStepRecommendation =
  | NextStepTaskRecommendation
  | NextStepHabitRecommendation
  | NextStepFallback;

export interface NextStepInput {
  habits: Habit[];
  tasks: Task[];
  milestones: Milestone[];
  projects?: Project[];
  /** Legacy Goal list ignored; retained for backward-compatible callers. */
  goals?: Goal[];
  /** Local calendar day "YYYY-MM-DD". Caller derives it (e.g. getTodayKey) so selection stays deterministic. */
  todayKey: string;
  /** Explicitly skipped work for this session. Skipped items are hidden when an alternative exists. */
  skippedTaskIds?: ReadonlySet<string> | readonly string[];
  skippedHabitIds?: ReadonlySet<number> | readonly number[];
  /**
   * Honor the "mandatory habits first" preference (see Today settings).
   * Defaults to true. When false, mandatory habits rank alongside optional
   * ones instead of outranking contextual tasks.
   */
  preferMandatoryHabits?: boolean;
}

function toSkippedTaskSet(value?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

function toSkippedHabitSet(value?: ReadonlySet<number> | readonly number[]): ReadonlySet<number> {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value);
}

function validScheduledMinutes(scheduledTime?: unknown): number | null {
  if (typeof scheduledTime !== "string") return null;
  if (!scheduledTime.trim()) return null;
  return timeToMinutes(scheduledTime);
}

/**
 * Strict "YYYY-MM-DD" calendar-key validation. Lexicographic date compares
 * elsewhere treat "" / "  " / malformed strings as real dates ("" sorts
 * before any todayKey, so it reads as overdue). Only validated keys may
 * support urgency claims ("Overdue", "Due today", backlog) or be echoed.
 */
function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const roundTrip = new Date(y, m - 1, d);
  return roundTrip.getFullYear() === y && roundTrip.getMonth() === m - 1 && roundTrip.getDate() === d;
}

function validDueDate(task: Pick<Task, "dueDate">): string | undefined {
  return isValidDateKey(task.dueDate) ? task.dueDate : undefined;
}

function isOverdueByKey(dueDate: string | undefined, todayKey: string): boolean {
  return dueDate !== undefined && dueDate < todayKey;
}

function taskDuration(task: Task): number | undefined {
  const candidate = task.durationMinutes ?? task.estimatedMinutes;
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : undefined;
}

function habitDuration(habit: Habit): number | undefined {
  return typeof habit.durationMinutes === "number" &&
    Number.isFinite(habit.durationMinutes) &&
    habit.durationMinutes > 0
    ? habit.durationMinutes
    : undefined;
}

function overdueAgeDays(dueDate: string, todayKey: string): number {
  return diffInDays(todayKey, dueDate);
}

/**
 * Shared stale-backlog definition (single source of truth with the Next Step
 * engine, which demotes these below today's habits): overdue longer than
 * STALE_OVERDUE_DAYS. Display-only — never hides, deletes, or reschedules.
 */
export function isTaskStaleBacklog(task: Task, todayKey: string): boolean {
  const dueDate = validDueDate(task);
  return (
    dueDate !== undefined &&
    isTaskOverdue(task, todayKey) &&
    overdueAgeDays(dueDate, todayKey) > STALE_OVERDUE_DAYS
  );
}

/**
 * "Otherwise ineligible" beyond completed/deleted: work under a finished
 * organizational parent. Dangling references are treated as standalone
 * (see normalizeRelationships): only links to existing entities can exclude.
 */
export interface ParentLookup {
  goalsById?: Map<string, Goal>;
  projectsById: Map<string, Project>;
  milestonesById: Map<string, Milestone>;
}

function isTaskParentEligible(task: Task, lookup: ParentLookup): boolean {
  const milestone = task.milestoneId !== undefined
    ? lookup.milestonesById.get(task.milestoneId)
    : undefined;
  if (task.milestoneId !== undefined && milestone !== undefined && milestone.completed) return false;

  const projectId = task.projectId ?? milestone?.projectId;
  const project = projectId !== undefined ? lookup.projectsById.get(projectId) : undefined;
  if (project !== undefined && (project.status === "completed" || project.status === "archived")) {
    return false;
  }

  return true;
}

/**
 * Habit eligibility mirrors tasks: a habit linked to a finished
 * (`completed`/`archived`) Project is excluded from recommendations so ending
 * a Project never leaves a stale "temporary" habit as the top suggestion.
 * Dangling `projectId` links (no such Project) are treated as standalone and
 * stay eligible — see `alignHabit` for storage-boundary detachment.
 */
function isHabitParentEligible(
  habit: Pick<Habit, "projectId">,
  lookup: ParentLookup,
): boolean {
  if (habit.projectId === undefined) return true;
  const project = lookup.projectsById.get(habit.projectId);
  if (project === undefined) return true;
  return project.status !== "completed" && project.status !== "archived";
}

const TASK_PRIORITY_RANK: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

/**
 * How a task is anchored in the user's plan. Resolved against existing
 * entities only: dangling ids count as "none" (standalone) so the engine
 * never invents an association — or a reason string — that isn't there.
 * Exported for tests: ranking uses it to prefer anchored contextual work,
 * and only anchored work, over standalone time blocks.
 */
export type TaskContextKind = "milestone" | "project" | "none";

export function taskContextKind(task: Task, lookup: ParentLookup): TaskContextKind {
  if (task.milestoneId !== undefined && lookup.milestonesById.has(task.milestoneId)) {
    return "milestone";
  }
  if (task.projectId !== undefined) {
    const project = lookup.projectsById.get(task.projectId);
    if (project !== undefined && project.status !== "completed" && project.status !== "archived") {
      return "project";
    }
  }
  return "none";
}

interface RankedTask {
  type: "task";
  task: Task;
  categoryRank: number;
  contextKind: TaskContextKind;
}

interface RankedHabit {
  type: "habit";
  habit: Habit;
  categoryRank: number;
}

type RankedCandidate = RankedTask | RankedHabit;

/**
 * Unified relevance order. Fresh overdue work outranks due-today work, but
 * stale backlog (overdue more than STALE_OVERDUE_DAYS) is demoted below
 * today's habits so a large old backlog cannot dominate every recommendation.
 * Mandatory habits outrank merely contextual tasks; among contextual tasks,
 * ones anchored to an active project or milestone outrank standalone
 * time blocks with no planning link; optional habits still outrank stale
 * backlog. Ranks are sparse (0,1,2,3,4,5,6) so a future split never
 * renumbers existing tiers.
 */
function categoryRankForTask(task: Task, todayKey: string, lookup: ParentLookup): number {
  if (isTaskStaleBacklog(task, todayKey)) return 6;
  const dueDate = validDueDate(task);
  if (isOverdueByKey(dueDate, todayKey)) return 0;
  if (dueDate !== undefined && dueDate === todayKey) return 1;
  if (taskContextKind(task, lookup) !== "none") return 3;
  return 4;
}

function categoryRankForHabit(habit: Habit, preferMandatoryHabits = true): number {
  if (habit.priority === "Mandatory" && preferMandatoryHabits) return 2;
  return 5;
}

/**
 * Most recent valid completion strictly before today ("YYYY-MM-DD").
 * "" means none (or nothing valid): never-completed sorts first, so the
 * engine prefers work the user hasn't done in a while when everything else
 * ties. Invalid and future entries are ignored, never crash.
 */
function habitRecencyKey(habit: Habit, todayKey: string): string {
  let latest = "";
  const dates = habit.completedDates;
  if (!Array.isArray(dates)) return latest;
  for (const dateKey of dates) {
    if (typeof dateKey !== "string") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    if (dateKey >= todayKey) continue;
    if (dateKey > latest) latest = dateKey;
  }
  return latest;
}

function compareRanked(a: RankedCandidate, b: RankedCandidate, todayKey: string): number {
  if (a.categoryRank !== b.categoryRank) return a.categoryRank - b.categoryRank;

  if (a.type === "task" && b.type === "task") {
    const priority = TASK_PRIORITY_RANK[a.task.priority] - TASK_PRIORITY_RANK[b.task.priority];
    if (priority !== 0) return priority;

    // Prefer small, actionable work when priority ties.
    const aDuration = taskDuration(a.task) ?? Number.POSITIVE_INFINITY;
    const bDuration = taskDuration(b.task) ?? Number.POSITIVE_INFINITY;
    if (aDuration !== bDuration) return aDuration - bDuration;

    const aDue = validDueDate(a.task) ?? "\uffff";
    const bDue = validDueDate(b.task) ?? "\uffff";
    if (aDue !== bDue) return aDue < bDue ? -1 : 1;

    const aSched = validScheduledMinutes(a.task.scheduledTime) ?? Number.POSITIVE_INFINITY;
    const bSched = validScheduledMinutes(b.task.scheduledTime) ?? Number.POSITIVE_INFINITY;
    if (aSched !== bSched) return aSched - bSched;

    if (a.task.createdAt !== b.task.createdAt) {
      return a.task.createdAt < b.task.createdAt ? -1 : 1;
    }
    return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
  }

  if (a.type === "habit" && b.type === "habit") {
    const aDuration = habitDuration(a.habit) ?? Number.POSITIVE_INFINITY;
    const bDuration = habitDuration(b.habit) ?? Number.POSITIVE_INFINITY;
    if (aDuration !== bDuration) return aDuration - bDuration;

    const aSched = validScheduledMinutes(a.habit.scheduledTime) ?? Number.POSITIVE_INFINITY;
    const bSched = validScheduledMinutes(b.habit.scheduledTime) ?? Number.POSITIVE_INFINITY;
    if (aSched !== bSched) return aSched - bSched;

    // Recent completions, last resort before id: prefer the habit done
    // longest ago (never-done first) when duration and schedule tie.
    const aRecent = habitRecencyKey(a.habit, todayKey);
    const bRecent = habitRecencyKey(b.habit, todayKey);
    if (aRecent !== bRecent) return aRecent < bRecent ? -1 : 1;

    return a.habit.id - b.habit.id;
  }

  // Same categoryRank cannot mix kinds with the current tiering, but keep a
  // deterministic fallback so future tiers cannot introduce flakiness.
  return a.type === b.type ? 0 : a.type === "task" ? -1 : 1;
}

function taskReason(task: Task, todayKey: string, contextKind: TaskContextKind): string {
  const dueDate = validDueDate(task);
  if (dueDate !== undefined && isOverdueByKey(dueDate, todayKey)) {
    const stale = isTaskStaleBacklog(task, todayKey) ? " · backlog" : "";
    return `Overdue since ${dueDate} · ${task.priority} priority${stale}`;
  }
  if (dueDate !== undefined && dueDate === todayKey) {
    return `Due today · ${task.priority} priority`;
  }
  if (task.scheduledTime !== undefined && validScheduledMinutes(task.scheduledTime) !== null) {
    return `Scheduled ${task.scheduledTime} · ${task.priority} priority`;
  }
  // Context label mirrors the resolved link only: dangling references fall
  // to "Available task" rather than claiming a milestone that isn't there.
  if (contextKind === "milestone") return `Active milestone · ${task.priority} priority`;
  if (contextKind === "project") return `Linked project · ${task.priority} priority`;
  return `Available task · ${task.priority} priority`;
}

function habitReason(habit: Habit): string {
  const base = habit.priority === "Mandatory" ? "Mandatory habit scheduled today" : "Habit scheduled today";
  if (habit.scheduledTime !== undefined && validScheduledMinutes(habit.scheduledTime) !== null) {
    return `${base} · Scheduled ${habit.scheduledTime}`;
  }
  return base;
}

function toRecommendation(
  winner: RankedCandidate,
  todayKey: string,
): NextStepTaskRecommendation | NextStepHabitRecommendation {
  if (winner.type === "task") {
    const task = winner.task;
    const dueDate = validDueDate(task);
    const recommendation: NextStepTaskRecommendation = {
      kind: "task",
      taskId: task.id,
      title: task.title,
      reason: taskReason(task, todayKey, winner.contextKind),
      priority: task.priority,
      overdue: isOverdueByKey(dueDate, todayKey),
    };
    if (dueDate !== undefined) recommendation.dueDate = dueDate;
    if (task.scheduledTime !== undefined && validScheduledMinutes(task.scheduledTime) !== null) {
      recommendation.scheduledTime = task.scheduledTime;
    }
    const duration = taskDuration(task);
    if (duration !== undefined) recommendation.durationMinutes = duration;
    return recommendation;
  }

  const habit = winner.habit;
  const recommendation: NextStepHabitRecommendation = {
    kind: "habit",
    habitId: habit.id,
    title: habit.name,
    reason: habitReason(habit),
    priority: habit.priority,
  };
  if (habit.scheduledTime !== undefined && validScheduledMinutes(habit.scheduledTime) !== null) {
    recommendation.scheduledTime = habit.scheduledTime;
  }
  const duration = habitDuration(habit);
  if (duration !== undefined) recommendation.durationMinutes = duration;
  return recommendation;
}

/** Stable key for pinning/skipping a recommendation without new storage. */
export function nextStepKey(
  candidate: Pick<NextStepTaskRecommendation | NextStepHabitRecommendation, "kind"> & {
    taskId?: string;
    habitId?: number;
  },
): string {
  return candidate.kind === "task" ? `task:${candidate.taskId}` : `habit:${candidate.habitId}`;
}

function rankCandidates(input: NextStepInput): {
  ranked: RankedCandidate[];
  skippedTaskIds: ReadonlySet<string>;
  skippedHabitIds: ReadonlySet<number>;
} {
  const projects = input.projects ?? [];
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const milestonesById = new Map(input.milestones.map((milestone) => [milestone.id, milestone]));
  const lookup: ParentLookup = { projectsById, milestonesById };
  const skippedTaskIds = toSkippedTaskSet(input.skippedTaskIds);
  const skippedHabitIds = toSkippedHabitSet(input.skippedHabitIds);

  // Engine eligibility is deliberately separate from Today's due-today list
  // (see selectTodayTasks): planning is optional, so an incomplete task with
  // no due date, scheduled time, or milestone link is still recommendable.
  // Completed items and work under finished parents stay excluded, and
  // future-dated work without a schedule or milestone link stays out — a
  // recommendation never claims urgency its data does not support.
  const eligibleTasks = input.tasks.filter((task) =>
    !task.completed &&
    isTaskParentEligible(task, lookup) &&
    !skippedTaskIds.has(task.id) &&
    ((validDueDate(task) !== undefined && isTaskDueTodayOrOverdue(task, input.todayKey)) ||
      validScheduledMinutes(task.scheduledTime) !== null ||
      task.milestoneId !== undefined ||
      task.dueDate === undefined)
  );

  const eligibleHabits = input.habits.filter((habit) => {
    const completedDates = Array.isArray(habit.completedDates) ? habit.completedDates : [];
    return !habit.isArchived &&
      isHabitParentEligible(habit, lookup) &&
      isHabitScheduledOnDate(habit, input.todayKey) &&
      !completedDates.includes(input.todayKey) &&
      !skippedHabitIds.has(habit.id);
  });

  const ranked: RankedCandidate[] = [
    ...eligibleTasks.map((task): RankedTask => ({
      type: "task",
      task,
      categoryRank: categoryRankForTask(task, input.todayKey, lookup),
      contextKind: taskContextKind(task, lookup),
    })),
    ...eligibleHabits.map((habit): RankedHabit => ({
      type: "habit",
      habit,
      categoryRank: categoryRankForHabit(habit, input.preferMandatoryHabits ?? true),
    })),
  ];
  ranked.sort((a, b) => compareRanked(a, b, input.todayKey));

  return { ranked, skippedTaskIds, skippedHabitIds };
}

/**
 * Ordered engine candidates (best first), without skips applied when called
 * without them. Powers the "choose another" picker so the user can switch
 * without leaving Today. Pure and deterministic like recommendNextStep.
 */
export function listNextStepCandidates(
  input: Omit<NextStepInput, "skippedTaskIds" | "skippedHabitIds">,
): Array<NextStepTaskRecommendation | NextStepHabitRecommendation> {
  const { ranked } = rankCandidates(input);
  return ranked.map((winner) => toRecommendation(winner, input.todayKey));
}

/**
 * Deterministic Next Step recommendation: at most one primary action.
 *
 * Tier order (first match wins): fresh overdue (0) → due today (1) →
 * mandatory habit when preferred (2) → contextual task anchored to an
 * active project or milestone (3) → standalone time block or
 * available undated task (4) → other habits due today (5) → stale
 * backlog (6). Within a tier: priority, then known effort (smaller first;
 * unknown never invented), then due date / scheduled time, then habit
 * recency (longest-ago-done first), then creation order and id.
 *
 * Reuses existing domain logic (isTaskOverdue / isTaskDueTodayOrOverdue /
 * isHabitScheduledOnDate / timeToMinutes / diffInDays) instead of
 * duplicating business rules. Pure and clock-free: the caller supplies
 * todayKey, so the same input always yields the same output. No network,
 * no LLM, no new storage; skips are caller-supplied and in-memory only.
 *
 * Limitations (deliberate, not intelligence):
 * - Eligibility is wider than Today's own lists on purpose: an incomplete
 *   task with no due date, schedule, or milestone link is recommendable as
 *   available work ("Available task"), while Today's lists keep showing
 *   only due, scheduled, or milestone-linked work. A recommendation therefore
 *   claims urgency ("Overdue", "Due today") only when its data supports it.
 * - Task recency is not ranked: tasks carry no completion timestamp, so
 *   "recently completed task" cannot be derived reliably. Completed tasks
 *   are only ever excluded, never boosted or demoted by recency.
 * - Skips are session-scoped by design (no new persistence): an explicitly
 *   rejected item never reappears within the same session while an
 *   alternative exists, but it can be recommended again on a later launch.
 * - Focus sessions are not an input: a session doesn't mark work complete
 *   and its item mapping is ambiguous, so recency comes from habit
 *   completedDates only.
 * - Durations, due dates, and links are only echoed when present and valid;
 *   nothing is estimated or inferred. With no available tasks or habits,
 *   the engine returns the honest "none" fallback.
 */
export function recommendNextStep(input: NextStepInput): NextStepRecommendation {
  const { ranked, skippedTaskIds, skippedHabitIds } = rankCandidates(input);

  const winner = ranked[0];
  if (!winner) {
    const anythingSkipped = skippedTaskIds.size > 0 || skippedHabitIds.size > 0;
    return {
      kind: "none",
      title: "No next step — everything for today is done",
      reason: anythingSkipped
        ? "No remaining incomplete habits or tasks after hiding skipped items."
        : "No incomplete habits or tasks are available right now.",
    };
  }

  return toRecommendation(winner, input.todayKey);
}
