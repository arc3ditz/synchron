import type { Goal, Habit, Milestone, Project, Task } from "../types";

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
      // A Task under a Milestone resolves its Project/Goal through that
      // Milestone, so it can never contradict the Milestone's hierarchy.
      if (milestone.projectId !== undefined) {
        projectId = milestone.projectId;
      }
      if (milestone.goalId !== undefined) {
        goalId = milestone.goalId;
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

/**
 * Align a single Project with existing Goals. Detaches a Goal reference that
 * no longer exists; never deletes anything.
 */
export function alignProject(project: Project, goals: Goal[]): Project {
  if (project.goalId !== undefined && !goals.some((goal) => goal.id === project.goalId)) {
    return { ...project, goalId: undefined };
  }
  return project;
}

/**
 * Align a single Milestone with its Project: a Milestone inside a Project must
 * resolve to that Project's Goal. Independent Milestones are left alone.
 */
export function alignMilestone(milestone: Milestone, projects: Project[]): Milestone {
  if (milestone.projectId === undefined) return milestone;
  const project = projects.find((candidate) => candidate.id === milestone.projectId);
  if (!project) {
    return { ...milestone, projectId: undefined };
  }
  if (milestone.goalId === project.goalId) return milestone;
  return { ...milestone, goalId: project.goalId };
}

/**
 * Align a single Task with the Milestone/Project hierarchy: a Task inside a
 * Milestone resolves its Project/Goal through that Milestone and can never
 * contradict it. Independent Tasks are left alone.
 */
export function alignTask(task: Task, milestones: Milestone[], projects: Project[]): Task {
  let milestoneId = task.milestoneId;
  let projectId = task.projectId;
  let goalId = task.goalId;

  if (milestoneId !== undefined) {
    const milestone = milestones.find((candidate) => candidate.id === milestoneId);
    if (!milestone) {
      milestoneId = undefined;
    } else {
      if (milestone.projectId !== undefined) {
        projectId = milestone.projectId;
      }
      if (milestone.goalId !== undefined) {
        goalId = milestone.goalId;
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
 * Keep child relationships consistent immediately after a Project's Goal
 * changes. Milestones of the Project and Tasks of the Project (or of its
 * Milestones) resolve to the Project's new Goal — or are cleared when the
 * Project becomes independent. No entity is deleted and no new relationship
 * is fabricated beyond the inherited Goal resolution.
 */
export function propagateProjectGoalChange(
  milestones: Milestone[],
  tasks: Task[],
  project: Project,
): { milestones: Milestone[]; tasks: Task[] } {
  const projectMilestoneIds = new Set(
    milestones.filter((milestone) => milestone.projectId === project.id).map((milestone) => milestone.id),
  );

  const nextMilestones = milestones.map((milestone) => {
    if (milestone.projectId !== project.id) return milestone;
    if (milestone.goalId === project.goalId) return milestone;
    return { ...milestone, goalId: project.goalId };
  });

  const nextTasks = tasks.map((task) => {
    const belongsToProject = task.projectId === project.id;
    const belongsToProjectMilestone = task.milestoneId !== undefined &&
      projectMilestoneIds.has(task.milestoneId);
    if (!belongsToProject && !belongsToProjectMilestone) return task;
    const projectId = belongsToProjectMilestone ? project.id : task.projectId;
    if (task.goalId === project.goalId && projectId === task.projectId) return task;
    return { ...task, projectId, goalId: project.goalId };
  });

  return { milestones: nextMilestones, tasks: nextTasks };
}

/**
 * Detach Habits linked to a deleted Goal without deleting the Habits.
 * Unrelated Habits are returned untouched.
 */
export function detachHabitsFromDeletedGoal(habits: Habit[], goalId: string): Habit[] {
  return habits.map((habit) =>
    habit.goalId === goalId ? { ...habit, goalId: undefined } : habit,
  );
}
