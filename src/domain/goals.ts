import type { FocusSessionRecord, Goal, Milestone, Project, Task, Habit } from "../types";
import { calculateStreak } from "../utils/dates.ts";

export function createGoal(data: Omit<Goal, "id" | "createdAt" | "status">): Goal {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "active",
  };
}

export function updateGoalStatus(goal: Goal, status: Goal["status"]): Goal {
  return { ...goal, status };
}

export function updateGoal(
  goal: Goal,
  data: Omit<Goal, "id" | "createdAt" | "status">,
): Goal {
  return { ...goal, ...data };
}

export function createMilestone(data: Omit<Milestone, "id" | "completed">): Milestone {
  return {
    ...data,
    id: crypto.randomUUID(),
    completed: false,
  };
}

export function toggleMilestone(milestone: Milestone): Milestone {
  return { ...milestone, completed: !milestone.completed };
}

export function updateMilestone(
  milestone: Milestone,
  data: Omit<Milestone, "id" | "completed">,
): Milestone {
  return { ...milestone, ...data };
}

export function deleteMilestone(milestones: Milestone[], milestoneId: string): Milestone[] {
  return milestones.filter((m) => m.id !== milestoneId);
}

export function detachTasksFromDeletedMilestone(tasks: Task[], milestone: Milestone): Task[] {
  return tasks.map((task) => task.milestoneId === milestone.id
    ? { ...task, goalId: task.goalId ?? milestone.goalId, milestoneId: undefined }
    : task);
}

export function disassociateGoalFocusSessions(
  sessions: FocusSessionRecord[],
  goalId: string,
  milestoneIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
): FocusSessionRecord[] {
  return sessions.map((session) => {
    const milestoneWasDeleted = session.milestoneId !== undefined && milestoneIds.has(session.milestoneId);
    const taskWasDeleted = session.taskId !== undefined && taskIds.has(session.taskId);
    if (session.goalId !== goalId && !milestoneWasDeleted && !taskWasDeleted) return session;

    return {
      ...session,
      goalId: session.goalId === goalId ? undefined : session.goalId,
      milestoneId: milestoneWasDeleted ? undefined : session.milestoneId,
      taskId: taskWasDeleted ? undefined : session.taskId,
    };
  });
}

export function calculateGoalProgress(
  goal: Goal,
  milestones: Milestone[],
  tasks: Task[],
  habits?: Habit[],
  streakFreeze?: boolean,
  dayResetHour?: number,
  projects?: Project[],
): {
  completed: number; 
  total: number; 
  percent: number;
  taskWeight: number;
  milestoneWeight: number;
  habitWeight: number;
  taskSegmentWidth: number;
  milestoneSegmentWidth: number;
  habitSegmentWidth: number;
} {
  const goalProjectIds = new Set(
    (projects ?? []).filter((project) => project.goalId === goal.id).map((project) => project.id),
  );

  // Milestones linked directly to the Goal or indirectly through its Projects.
  const goalMilestonesById = new Map<string, Milestone>();
  for (const milestone of milestones) {
    const belongsToGoal = milestone.goalId === goal.id;
    const belongsToGoalProject = milestone.projectId !== undefined && goalProjectIds.has(milestone.projectId);
    if (belongsToGoal || belongsToGoalProject) {
      goalMilestonesById.set(milestone.id, milestone);
    }
  }
  const goalMilestones = [...goalMilestonesById.values()];
  const milestoneIds = new Set(goalMilestones.map((m) => m.id));

  // Tasks linked directly to the Goal, to one of its Milestones, or to one of its Projects.
  const goalTasksById = new Map<string, Task>();
  for (const task of tasks) {
    const belongsToGoal = task.goalId === goal.id;
    const belongsToGoalMilestone = task.milestoneId !== undefined && milestoneIds.has(task.milestoneId);
    const belongsToGoalProject = task.projectId !== undefined && goalProjectIds.has(task.projectId);
    if (belongsToGoal || belongsToGoalMilestone || belongsToGoalProject) {
      goalTasksById.set(task.id, task);
    }
  }
  const goalTasks = [...goalTasksById.values()];
  
  const completedMilestones = goalMilestones.filter((m) => m.completed).length;
  const completedTasks = goalTasks.filter((t) => t.completed).length;
  
  // Calculate habit streak health if habits are provided
  let habitHealth = 0;
  if (habits && streakFreeze !== undefined && dayResetHour !== undefined) {
    const linkedHabits = habits.filter((habit) => habit.goalId === goal.id);
    if (linkedHabits.length > 0) {
      const totalStreak = linkedHabits.reduce((sum, habit) => sum + calculateStreak(habit, streakFreeze, dayResetHour), 0);
      habitHealth = Math.min(100, totalStreak * 10); // Cap at 100, 10 points per streak day
    }
  }
  
  // Calculate weighted progress
  const taskWeight = goalTasks.length > 0 ? (completedTasks / goalTasks.length) * 100 : 0;
  const milestoneWeight = goalMilestones.length > 0 ? (completedMilestones / goalMilestones.length) * 100 : 0;
  const habitWeight = habitHealth;

  const taskShare = goalTasks.length > 0 ? 0.5 : 0;
  const milestoneShare = goalMilestones.length > 0 ? 0.3 : 0;
  const habitShare = linkedHabitCount(habits, goal) > 0 ? 0.2 : 0;
  const availableShare = taskShare + milestoneShare + habitShare;
  
  const totalItems = goalMilestones.length + goalTasks.length;
  const completedItems = completedMilestones + completedTasks;
  const taskSegmentWidth = getSegmentWidth(taskWeight, taskShare, availableShare);
  const milestoneSegmentWidth = getSegmentWidth(milestoneWeight, milestoneShare, availableShare);
  const habitSegmentWidth = getSegmentWidth(habitWeight, habitShare, availableShare);
  // One deterministic progress breakdown: the displayed percent is exactly the
  // fill represented by the segment widths of the same bar.
  const percent = Math.min(100, taskSegmentWidth + milestoneSegmentWidth + habitSegmentWidth);
  
  return {
    completed: completedItems,
    total: totalItems,
    percent,
    taskWeight: Math.round(taskWeight),
    milestoneWeight: Math.round(milestoneWeight),
    habitWeight: Math.round(habitWeight),
    taskSegmentWidth,
    milestoneSegmentWidth,
    habitSegmentWidth,
  };
}

function linkedHabitCount(habits: Habit[] | undefined, goal: Goal): number {
  return habits?.filter((habit) => habit.goalId === goal.id).length ?? 0;
}

function getSegmentWidth(progress: number, share: number, availableShare: number): number {
  if (share === 0 || availableShare === 0) return 0;
  return Math.min(100, Math.max(0, Math.floor(progress * share / availableShare)));
}