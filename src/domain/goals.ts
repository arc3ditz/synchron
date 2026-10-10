import type { Milestone, Task } from "../types";

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
    ? { ...task, milestoneId: undefined }
    : task);
}
