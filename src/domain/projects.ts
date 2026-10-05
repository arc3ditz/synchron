import type { Project, Milestone, Task, FocusSessionRecord } from "../types";

export function createProject(data: Omit<Project, "id" | "createdAt" | "status">): Project {
  return {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "planned",
  };
}

export function updateProjectStatus(project: Project, status: Project["status"]): Project {
  return { ...project, status };
}

export function updateProject(
  project: Project,
  data: Omit<Project, "id" | "createdAt" | "status">,
): Project {
  return { ...project, ...data };
}

export function deleteProject(projects: Project[], projectId: string): Project[] {
  return projects.filter((project) => project.id !== projectId);
}

export function detachMilestonesFromDeletedProject(milestones: Milestone[], project: Project): Milestone[] {
  return milestones.map((milestone) => milestone.projectId === project.id
    ? { ...milestone, goalId: milestone.goalId ?? project.goalId, projectId: undefined }
    : milestone);
}

export function detachTasksFromDeletedProject(tasks: Task[], project: Project, milestones: Milestone[] = []): Task[] {
  const projectMilestoneIds = new Set(
    milestones.filter((milestone) => milestone.projectId === project.id).map((milestone) => milestone.id),
  );
  return tasks.map((task) => {
    const directlyAttached = task.projectId === project.id;
    const viaDeletedMilestone = task.milestoneId !== undefined && projectMilestoneIds.has(task.milestoneId);
    if (!directlyAttached && !viaDeletedMilestone) return task;
    // Only the deleted Project reference is cleared; a Task pointing at a
    // different surviving Project keeps that relationship.
    const projectId = directlyAttached ? undefined : task.projectId;
    const goalId = task.goalId ?? project.goalId;
    if (projectId === task.projectId && goalId === task.goalId) return task;
    return { ...task, projectId, goalId };
  });
}

export function disassociateProjectFocusSessions(
  sessions: FocusSessionRecord[],
  projectId: string,
  milestoneIds: ReadonlySet<string>,
  taskIds: ReadonlySet<string>,
): FocusSessionRecord[] {
  return sessions.map((session) => {
    const milestoneWasDeleted = session.milestoneId !== undefined && milestoneIds.has(session.milestoneId);
    const taskWasDeleted = session.taskId !== undefined && taskIds.has(session.taskId);
    if (session.milestoneId && milestoneWasDeleted) return session;
    if (session.taskId && taskWasDeleted) return session;
    if (session.projectId !== projectId) return session;

    return { ...session, projectId: undefined };
  });
}

export function detachGoalFromProjects(projects: Project[], goalId: string): Project[] {
  return projects.map((project) => project.goalId === goalId
    ? { ...project, goalId: undefined }
    : project);
}

export function filterProjectsByGoal(projects: Project[], goalId: string): Project[] {
  return projects.filter((project) => project.goalId === goalId);
}

export function filterMilestonesByProject(milestones: Milestone[], projectId: string): Milestone[] {
  return milestones.filter((milestone) => milestone.projectId === projectId);
}

export function filterTasksByProject(tasks: Task[], projectId: string): Task[] {
  return tasks.filter((task) => task.projectId === projectId);
}

export interface ProjectProgress {
  total: number;
  completed: number;
  percent: number;
  taskTotal: number;
  taskCompleted: number;
  taskPercent: number;
  milestoneTotal: number;
  milestoneCompleted: number;
  milestonePercent: number;
}

/**
 * Overall Project progress derives from Milestones and Tasks only —
 * habit completion never contributes to a Project's progress.
 */
export function calculateProjectProgress(
  project: Project,
  milestones: Milestone[],
  tasks: Task[],
): ProjectProgress {
  const projectMilestones = milestones.filter((milestone) => milestone.projectId === project.id);
  const milestoneIds = new Set(projectMilestones.map((milestone) => milestone.id));
  const projectTasks = tasks.filter((task) =>
    task.projectId === project.id ||
    (task.milestoneId !== undefined && milestoneIds.has(task.milestoneId)),
  );

  const milestoneCompleted = projectMilestones.filter((milestone) => milestone.completed).length;
  const taskCompleted = projectTasks.filter((task) => task.completed).length;
  const total = projectMilestones.length + projectTasks.length;
  const completed = milestoneCompleted + taskCompleted;

  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    taskTotal: projectTasks.length,
    taskCompleted,
    taskPercent: projectTasks.length > 0
      ? Math.round((taskCompleted / projectTasks.length) * 100)
      : 0,
    milestoneTotal: projectMilestones.length,
    milestoneCompleted,
    milestonePercent: projectMilestones.length > 0
      ? Math.round((milestoneCompleted / projectMilestones.length) * 100)
      : 0,
  };
}
