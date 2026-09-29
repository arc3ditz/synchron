import type { Task } from "../types";

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

export function filterTasksByGoal(tasks: Task[], goalId: string): Task[] {
  return tasks.filter((task) => task.goalId === goalId);
}

export function filterTasksByMilestone(tasks: Task[], milestoneId: string): Task[] {
  return tasks.filter((task) => task.milestoneId === milestoneId);
}