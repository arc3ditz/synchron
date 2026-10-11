import type { Milestone, Task } from "../types";

export interface MilestoneTaskCompletionState {
  tasks: Task[];
  milestones: Milestone[];
}

/**
 * Keep milestone/task completion consistent. Task changes derive the state of
 * milestones with children; an explicit milestone toggle first applies that
 * choice to its linked tasks. Milestones without tasks retain their manual state.
 */
export function synchronizeMilestoneTaskCompletion(
  tasks: Task[],
  milestones: Milestone[],
  manuallyToggledMilestoneId?: string,
): MilestoneTaskCompletionState {
  let nextTasks = tasks;
  let nextMilestones = milestones;

  if (manuallyToggledMilestoneId !== undefined) {
    const milestone = milestones.find((item) => item.id === manuallyToggledMilestoneId);
    if (milestone) {
      const completed = !milestone.completed;
      let tasksChanged = false;
      nextTasks = tasks.map((task) => {
        if (task.milestoneId !== milestone.id || task.completed === completed) return task;
        tasksChanged = true;
        return { ...task, completed };
      });
      if (!tasksChanged) nextTasks = tasks;

      let milestonesChanged = false;
      nextMilestones = milestones.map((item) => {
        if (item.id !== milestone.id || item.completed === completed) return item;
        milestonesChanged = true;
        return { ...item, completed };
      });
      if (!milestonesChanged) nextMilestones = milestones;
    }
  }

  const linkedTaskCounts = new Map<string, { total: number; completed: number }>();
  for (const task of nextTasks) {
    if (task.milestoneId === undefined) continue;
    const count = linkedTaskCounts.get(task.milestoneId) ?? { total: 0, completed: 0 };
    count.total += 1;
    if (task.completed) count.completed += 1;
    linkedTaskCounts.set(task.milestoneId, count);
  }

  let milestonesChanged = false;
  const synchronizedMilestones = nextMilestones.map((milestone) => {
    const count = linkedTaskCounts.get(milestone.id);
    if (!count || count.total === 0) return milestone;
    const completed = count.completed === count.total;
    if (milestone.completed === completed) return milestone;
    milestonesChanged = true;
    return { ...milestone, completed };
  });
  if (milestonesChanged) nextMilestones = synchronizedMilestones;

  return { tasks: nextTasks, milestones: nextMilestones };
}
