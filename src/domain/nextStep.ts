import type { Goal, Habit, Milestone, Project, Task } from "../types";
import { getValidTaskDueDate, isTaskDueTodayOrOverdue, isTaskOverdue } from "./tasks.ts";
import { timeToMinutes } from "./timeline.ts";
import { diffInDays, isHabitScheduledOnDate } from "../utils/dates.ts";
import { TASK_PRIORITY_LABELS } from "../utils/displayLabels.ts";

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

export interface NextStepMilestoneRecommendation {
  kind: "milestone";
  milestoneId: string;
  projectId?: string;
  title: string;
  reason: string;
}

export interface NextStepFallback {
  kind: "none";
  title: string;
  reason: string;
}

export type NextStepAction =
  | NextStepTaskRecommendation
  | NextStepHabitRecommendation
  | NextStepMilestoneRecommendation;

export type NextStepRecommendation = NextStepAction | NextStepFallback;

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
  const dueDate = getValidTaskDueDate(task);
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
  if ((task.isBacklog && task.dueDate === undefined) || isTaskStaleBacklog(task, todayKey)) return 6;
  const dueDate = getValidTaskDueDate(task);
  if (isTaskOverdue(task, todayKey)) return 0;
  if (dueDate !== undefined && dueDate === todayKey) return 1;
  if (taskContextKind(task, lookup) !== "none") return 3;
  return 4;
}

function categoryRankForHabit(habit: Habit): number {
  if (habit.priority === "Mandatory") return 2;
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

    const aDue = getValidTaskDueDate(a.task) ?? "\uffff";
    const bDue = getValidTaskDueDate(b.task) ?? "\uffff";
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
  const dueDate = getValidTaskDueDate(task);
  if (dueDate !== undefined && isTaskOverdue(task, todayKey)) {
    const stale = isTaskStaleBacklog(task, todayKey) ? " · Backlog" : "";
    return `Overdue Since ${dueDate} · ${TASK_PRIORITY_LABELS[task.priority]} Priority${stale}`;
  }
  if (dueDate !== undefined && dueDate === todayKey) {
    return `Due Today · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
  }
  if (task.isBacklog && dueDate === undefined) return `Backlog · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
  if (task.scheduledTime !== undefined && validScheduledMinutes(task.scheduledTime) !== null) {
    return `Scheduled ${task.scheduledTime} · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
  }
  // Context label mirrors the resolved link only: dangling references fall
  // to "Available task" rather than claiming a milestone that isn't there.
  if (contextKind === "milestone") return `Active Milestone · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
  if (contextKind === "project") return `Linked Project · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
  return `Available Task · ${TASK_PRIORITY_LABELS[task.priority]} Priority`;
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
    const dueDate = getValidTaskDueDate(task);
    const recommendation: NextStepTaskRecommendation = {
      kind: "task",
      taskId: task.id,
      title: task.title,
      reason: taskReason(task, todayKey, winner.contextKind),
      priority: task.priority,
      overdue: isTaskOverdue(task, todayKey),
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
  candidate: Pick<NextStepAction, "kind"> & {
    taskId?: string;
    habitId?: number;
    milestoneId?: string;
  },
): string {
  if (candidate.kind === "task") return `task:${candidate.taskId}`;
  if (candidate.kind === "habit") return `habit:${candidate.habitId}`;
  return `milestone:${candidate.milestoneId}`;
}

/**
 * Selects Today's one next action using only explicit, existing eligibility
 * and ordering signals. Tiers are mandatory habits → overdue tasks → due
 * today tasks → active project/milestone work → eligible standalone tasks.
 * Configured task priority breaks ties only between tasks in the same tier;
 * otherwise original collection order is retained for deterministic ties.
 */
export function listTodayNextActions(
  input: NextStepInput,
): NextStepAction[] {
  const skippedTaskIds = toSkippedTaskSet(input.skippedTaskIds);
  const skippedHabitIds = toSkippedHabitSet(input.skippedHabitIds);
  const projects = input.projects ?? [];
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const milestonesById = new Map(input.milestones.map((milestone) => [milestone.id, milestone]));
  const lookup: ParentLookup = { projectsById, milestonesById };
  const ranked: Array<{ candidate: RankedCandidate | { type: "milestone"; milestone: Milestone; categoryRank: number }; order: number }> = [];

  input.habits.forEach((habit, index) => {
    const completedDates = Array.isArray(habit.completedDates) ? habit.completedDates : [];
    if (
      habit.priority !== "Mandatory" ||
      habit.isArchived ||
      !isHabitParentEligible(habit, lookup) ||
      !isHabitScheduledOnDate(habit, input.todayKey) ||
      completedDates.includes(input.todayKey) ||
      skippedHabitIds.has(habit.id)
    ) return;

    ranked.push({ candidate: { type: "habit", habit, categoryRank: 0 }, order: index });
  });

  input.tasks.forEach((task, index) => {
    if (
      task.completed ||
      task.isBacklog ||
      skippedTaskIds.has(task.id) ||
      !isTaskParentEligible(task, lookup)
    ) return;

    const dueDate = getValidTaskDueDate(task);
    let categoryRank: number;
    if (dueDate !== undefined && isTaskOverdue(task, input.todayKey)) categoryRank = 1;
    else if (dueDate === input.todayKey) categoryRank = 2;
    else if (taskContextKind(task, lookup) !== "none") categoryRank = 3;
    else if (task.dueDate === undefined) categoryRank = 4;
    else return;

    ranked.push({ candidate: {
      type: "task",
      task,
      categoryRank,
      contextKind: taskContextKind(task, lookup),
    }, order: input.habits.length + index });
  });

  input.milestones.forEach((milestone, index) => {
    if (milestone.completed) return;
    if (milestone.projectId === undefined) return;
    const project = projectsById.get(milestone.projectId);
    if (!project || project.status !== "active") return;
    ranked.push({
      candidate: { type: "milestone", milestone, categoryRank: 3 },
      order: input.habits.length + input.tasks.length + index,
    });
  });

  ranked.sort((a, b) => {
    const tierDifference = a.candidate.categoryRank - b.candidate.categoryRank;
    if (tierDifference !== 0) return tierDifference;
    if (a.candidate.type === "task" && b.candidate.type === "task") {
      const priorityDifference =
        TASK_PRIORITY_RANK[a.candidate.task.priority] -
        TASK_PRIORITY_RANK[b.candidate.task.priority];
      if (priorityDifference !== 0) return priorityDifference;
    }
    return a.order - b.order;
  });

  return ranked.map(({ candidate }) => {
    if (candidate.type === "milestone") {
      return {
        kind: "milestone",
        milestoneId: candidate.milestone.id,
        projectId: candidate.milestone.projectId,
        title: candidate.milestone.title,
        reason: "Active Project Milestone",
      };
    }

    const recommendation = toRecommendation(candidate, input.todayKey);
    if (candidate.type === "task" && recommendation.kind === "task") {
      recommendation.reason = candidate.categoryRank === 3
        ? candidate.contextKind === "milestone" ? "Active Milestone Task" : "Active Project Task"
        : candidate.categoryRank === 4 ? "Available Task" : recommendation.reason.split(" · ")[0];
    }
    return recommendation;
  });
}

export function selectTodayNextAction(input: NextStepInput): NextStepRecommendation {
  const winner = listTodayNextActions(input)[0];
  if (winner) return winner;

  const anythingSnoozed =
    toSkippedTaskSet(input.skippedTaskIds).size > 0 ||
    toSkippedHabitSet(input.skippedHabitIds).size > 0;
  return {
    kind: "none",
    title: "Nothing Needs Attention Right Now.",
    reason: anythingSnoozed
      ? "Snoozed items will reappear after their return time."
      : "Eligible mandatory habits and tasks will appear here when they are due.",
  };
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
    ((getValidTaskDueDate(task) !== undefined && isTaskDueTodayOrOverdue(task, input.todayKey)) ||
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
      categoryRank: categoryRankForHabit(habit),
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
 * - Skips are caller-supplied eligibility exclusions. Today persists their
 *   absolute return timestamps separately, while this engine remains pure.
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
      title: "No Next Step — Everything for Today Is Done",
      reason: anythingSkipped
        ? "No remaining incomplete habits or tasks after hiding skipped items."
        : "No incomplete habits or tasks are available right now.",
    };
  }

  return toRecommendation(winner, input.todayKey);
}
