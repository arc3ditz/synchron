import type { Goal, Milestone, Task, Habit } from "../types";
import { calculateStreak } from "../utils/dates";

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

export function calculateGoalProgress(
  goal: Goal,
  milestones: Milestone[],
  tasks: Task[],
  habits?: Habit[],
  streakFreeze?: boolean,
  dayResetHour?: number,
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
  const goalMilestones = milestones.filter((m) => m.goalId === goal.id);
  const milestoneIds = new Set(goalMilestones.map((m) => m.id));
  
  // Get tasks directly linked to goal or via milestones
  const goalTasks = tasks.filter(
    (task) => task.goalId === goal.id || (task.milestoneId && milestoneIds.has(task.milestoneId)),
  );
  
  const completedMilestones = goalMilestones.filter((m) => m.completed).length;
  const completedTasks = goalTasks.filter((t) => t.completed).length;
  
  // Calculate habit streak health if habits are provided
  let habitHealth = 0;
  let linkedHabits: Habit[] = [];
  if (habits && streakFreeze !== undefined && dayResetHour !== undefined) {
    linkedHabits = habits.filter((habit) => habit.goalId === goal.id);
    if (linkedHabits.length > 0) {
      const totalStreak = linkedHabits.reduce((sum, habit) => sum + calculateStreak(habit, streakFreeze, dayResetHour), 0);
      habitHealth = Math.min(100, totalStreak * 10); // Cap at 100, 10 points per streak day
    }
  }
  
  // Calculate weighted progress
  const taskWeight = goalTasks.length > 0 ? (completedTasks / goalTasks.length) * 100 : 0;
  const milestoneWeight = goalMilestones.length > 0 ? (completedMilestones / goalMilestones.length) * 100 : 0;
  const habitWeight = habitHealth;
  
  // Overall weighted average (tasks: 50%, milestones: 30%, habits: 20%)
  const taskContribution = goalTasks.length > 0 ? 0.5 : 0;
  const milestoneContribution = goalMilestones.length > 0 ? 0.3 : 0;
  const habitContribution = linkedHabits.length > 0 ? 0.2 : 0;
  
  const totalWeight = taskContribution + milestoneContribution + habitContribution;
  const weightedPercent = totalWeight > 0 
    ? ((taskWeight * taskContribution) + (milestoneWeight * milestoneContribution) + (habitWeight * habitContribution)) / totalWeight
    : 0;
  
  // For visual display: segment widths show individual component progress (0-100% each)
  // This allows users to see the progress of each component independently
  const taskSegmentWidth = taskWeight;
  const milestoneSegmentWidth = milestoneWeight;
  const habitSegmentWidth = habitWeight;
  
  const totalItems = goalMilestones.length + goalTasks.length;
  const completedItems = completedMilestones + completedTasks;
  
  const percent = Math.round(weightedPercent);
  
  return {
    completed: completedItems,
    total: totalItems,
    percent,
    taskWeight: Math.round(taskWeight),
    milestoneWeight: Math.round(milestoneWeight),
    habitWeight: Math.round(habitWeight),
    taskSegmentWidth: Math.round(taskSegmentWidth * 100),
    milestoneSegmentWidth: Math.round(milestoneSegmentWidth * 100),
    habitSegmentWidth: Math.round(habitSegmentWidth * 100),
  };
}