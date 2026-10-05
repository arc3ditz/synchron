import type { Goal, Milestone, Project, Task } from "../types";

export interface NormalizedRelationships {
  projects: Project[];
  milestones: Milestone[];
  tasks: Task[];
}

/**
 * Domain-level validation/normalization for Goal → Project → Milestone → Task
 * relationships. Never fabricates relationships and never deletes entities;
 * invalid references are detached (set to undefined) and valid ones preserved.
 */
export function normalizeRelationships(
  goals: Goal[],
  projects: Project[],
  milestones: Milestone[],
  tasks: Task[],
): NormalizedRelationships {
  const goalIds = new Set(goals.map((goal) => goal.id));
  const projectIds = new Set(projects.map((project) => project.id));

  const normalizedProjects = projects.map((project) => {
    if (project.goalId !== undefined && !goalIds.has(project.goalId)) {
      return { ...project, goalId: undefined };
    }
    return project;
  });
  const normalizedProjectById = new Map(normalizedProjects.map((project) => [project.id, project]));

  const normalizedMilestones = milestones.map((milestone) => {
    if (milestone.projectId !== undefined) {
      const project = normalizedProjectById.get(milestone.projectId);
      if (!project) {
        // Milestone points to a nonexistent Project: detach it. Its own
        // goalId must still reference an existing Goal.
        return {
          ...milestone,
          projectId: undefined,
          goalId: milestone.goalId !== undefined && goalIds.has(milestone.goalId)
            ? milestone.goalId
            : undefined,
        };
      }
      // A Milestone with a Project must be consistent with that Project's Goal.
      return { ...milestone, goalId: project.goalId };
    }
    if (milestone.goalId !== undefined && !goalIds.has(milestone.goalId)) {
      return { ...milestone, goalId: undefined };
    }
    return milestone;
  });
  const normalizedMilestoneById = new Map(
    normalizedMilestones.map((milestone) => [milestone.id, milestone]),
  );

  const normalizedTasks = tasks.map((task) => {
    let milestoneId = task.milestoneId;
    let projectId = task.projectId;
    let goalId = task.goalId;

    const milestone = milestoneId !== undefined ? normalizedMilestoneById.get(milestoneId) : undefined;
    if (milestoneId !== undefined && !milestone) {
      milestoneId = undefined;
    }

    if (milestone) {
      // A Task under a Milestone must match that Milestone's Project when both exist.
      if (projectId !== undefined && projectId !== milestone.projectId) {
        projectId = milestone.projectId;
      }
    } else if (projectId !== undefined && !projectIds.has(projectId)) {
      projectId = undefined;
    }

    if (goalId !== undefined && !goalIds.has(goalId)) {
      goalId = undefined;
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
