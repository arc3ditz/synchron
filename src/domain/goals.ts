import type { Goal, Milestone } from "../types";

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