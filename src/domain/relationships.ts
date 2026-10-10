import type { Goal, Habit, Milestone, Project, Task } from "../types";
// Goal is referenced only in the optional legacy overload of normalizeRelationships/alignProject.

export interface NormalizedRelationships {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
}

/**
 * Domain-level validation/normalization for Project → Milestone → Task
 * relationships. Never fabricates relationships and never deletes entities;
 * invalid references are detached (set to undefined) and valid ones preserved.
 * Legacy `goalId` fields are preserved verbatim for backward compatibility
 * (no new Goal links are created by the UI).
 */
export function normalizeRelationships(
  goals: Goal[] | Project[],
  projects: Project[] | Milestone[],
  milestones: Milestone[] | Task[],
  tasks?: Task[],
): NormalizedRelationships {
  // Backward-compatible overload: normalizeRelationships(projects, milestones, tasks)
  // or the legacy normalizeRelationships(goals, projects, milestones, tasks).
  let normProjects: Project[];
  let normMilestones: Milestone[];
  let normTasks: Task[];
  if (tasks === undefined) {
    normProjects = goals as Project[];
    normMilestones = projects as Milestone[];
    normTasks = milestones as Task[];
  } else {
    normProjects = projects as Project[];
    normMilestones = milestones as Milestone[];
    normTasks = tasks;
  }
  const projectIds = new Set(normProjects.map((project) => project.id));

  const normalizedProjects = normProjects.map((project) => project);

  const normalizedProjectById = new Map(normalizedProjects.map((project) => [project.id, project]));

  const normalizedMilestones = normMilestones.map((milestone) => {
    if (milestone.projectId !== undefined) {
      const project = normalizedProjectById.get(milestone.projectId);
      if (!project) {
        // Milestone points to a nonexistent Project: detach it.
        // Legacy goalId is preserved verbatim.
        return {
          ...milestone,
          projectId: undefined,
        };
      }
      return milestone;
    }
    return milestone;
  });
  const normalizedMilestoneById = new Map(
    normalizedMilestones.map((milestone) => [milestone.id, milestone]),
  );

  const normalizedTasks = normTasks.map((task) => {
    let milestoneId = task.milestoneId;
    let projectId = task.projectId;
    const goalId = task.goalId;

    const milestone = milestoneId !== undefined ? normalizedMilestoneById.get(milestoneId) : undefined;
    if (milestoneId !== undefined && !milestone) {
      milestoneId = undefined;
    }

    if (milestone) {
      // A Task under a Milestone resolves its Project through that
      // Milestone, so it can never contradict the Milestone's hierarchy.
      // Legacy goalId is preserved verbatim.
      if (milestone.projectId !== undefined) {
        projectId = milestone.projectId;
      }
    } else if (projectId !== undefined && !projectIds.has(projectId)) {
      projectId = undefined;
    }

    if (
      milestoneId === task.milestoneId &&
      projectId === task.projectId &&
      goalId === task.goalId
    ) {
      return task;
    }
    return { ...task, milestoneId, projectId, goalId };
  });

  return {
    projects: normalizedProjects,
    milestones: normalizedMilestones,
    tasks: normalizedTasks,
  };
}

/**
 * Align a single Project. Legacy `goalId` is preserved verbatim; no new
 * Goal links are created.
 */
export function alignProject(project: Project, ..._rest: unknown[]): Project {
  void _rest;
  return project;
}

/**
 * Align a single Milestone with its Project existence. Legacy `goalId` is
 * preserved verbatim. Independent Milestones are left alone.
 */
export function alignMilestone(milestone: Milestone, projects: Project[]): Milestone {
  if (milestone.projectId === undefined) return milestone;
  const project = projects.find((candidate) => candidate.id === milestone.projectId);
  if (!project) {
    return { ...milestone, projectId: undefined };
  }
  return milestone;
}

/**
 * Align a single Task with the Milestone/Project hierarchy: a Task inside a
 * Milestone resolves its Project/Goal through that Milestone and can never
 * contradict it. Independent Tasks are left alone.
 */
export function alignTask(task: Task, milestones: Milestone[], projects: Project[]): Task {
  let milestoneId = task.milestoneId;
  let projectId = task.projectId;
  const goalId = task.goalId;

  if (milestoneId !== undefined) {
    const milestone = milestones.find((candidate) => candidate.id === milestoneId);
    if (!milestone) {
      milestoneId = undefined;
    } else {
      if (milestone.projectId !== undefined) {
        projectId = milestone.projectId;
      }
    }
  }

  if (projectId !== undefined && !projects.some((project) => project.id === projectId)) {
    projectId = undefined;
  }

  if (
    milestoneId === task.milestoneId &&
    projectId === task.projectId &&
    goalId === task.goalId
  ) {
    return task;
  }
  return { ...task, milestoneId, projectId, goalId };
}

/**
 * Align a single Habit with Project existence. Dangling `projectId` links are
 * detached (set to undefined) so the habit becomes standalone; valid links
 * and legacy `goalId` fields are preserved verbatim. Never deletes the habit
 * or its history.
 */
export function alignHabit(habit: Habit, projects: Project[]): Habit {
  if (habit.projectId === undefined) return habit;
  const project = projects.find((candidate) => candidate.id === habit.projectId);
  if (!project) {
    return { ...habit, projectId: undefined };
  }
  return habit;
}

/**
 * Normalize Habit → Project links at the storage boundary. Same detach (not
 * delete) semantics as Milestones/Tasks.
 */
export function normalizeHabitProjectLinks(habits: Habit[], projects: Project[]): Habit[] {
  return habits.map((habit) => alignHabit(habit, projects));
}

/**
 * Keep a Milestone's Tasks consistent immediately after the Milestone moves
 * between Projects. Each child Task re-resolves its Project through the
 * updated Milestone (see alignTask) so no stale reference survives the move.
 * `milestones` must already contain the updated Milestone. Legacy `goalId`
 * fields are preserved verbatim.
 */
export function propagateMilestoneMove(
  tasks: Task[],
  milestone: Pick<Milestone, "id" | "projectId"> & Partial<Pick<Milestone, "goalId">>,
  milestones: Milestone[],
  projects: Project[],
): Task[] {
  return tasks.map((task) =>
    task.milestoneId === milestone.id ? alignTask(task, milestones, projects) : task,
  );
}
