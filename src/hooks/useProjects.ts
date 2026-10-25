import { useCallback, useState } from "react";
import {
  addProjectDecision,
  addProjectNote,
  archiveProjectRecord,
  createProject,
  deleteProjectDecision,
  deleteProjectNote,
  findProjectByName,
  loadProjectStore,
  normalizeProjectName,
  persistProjectStore,
  renameProjectRecord,
  restoreProjectRecord,
  touchProjectsRecord,
  updateProjectDecision,
  updateProjectDescriptionRecord,
  updateProjectFocusRecord,
  updateProjectNote,
  updateProjectResumeRecord,
  type Project,
  type ProjectStoreData,
} from "../projectStore";

export type ProjectMutationResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };

export interface ProjectsController extends ProjectStoreData {
  storageError?: string;
  addProject: (name: string, description?: string) => ProjectMutationResult;
  renameProject: (id: string, name: string) => ProjectMutationResult;
  updateProjectDescription: (id: string, description: string) => ProjectMutationResult;
  updateProjectFocus: (id: string, focus: string) => ProjectMutationResult;
  updateProjectResume: (id: string, note: string) => ProjectMutationResult;
  archiveProject: (id: string) => ProjectMutationResult;
  restoreProject: (id: string) => ProjectMutationResult;
  /**
   * Moves linked projects' updatedAt forward after action work changes their
   * context. Kept separate from the action store so actions stay canonical.
   */
  recordProjectActivity: (projectIds: string[], at?: string) => void;
  addNote: (projectId: string, title: string, content?: string) => ProjectMutationResult;
  updateNote: (
    projectId: string,
    noteId: string,
    title: string,
    content: string,
  ) => ProjectMutationResult;
  deleteNote: (projectId: string, noteId: string) => ProjectMutationResult;
  addDecision: (
    projectId: string,
    statement: string,
    rationale: string,
  ) => ProjectMutationResult;
  updateDecision: (
    projectId: string,
    decisionId: string,
    statement: string,
    rationale: string,
  ) => ProjectMutationResult;
  deleteDecision: (projectId: string, decisionId: string) => ProjectMutationResult;
}

const EMPTY_NAME_ERROR = "Give the project a name first.";
const DUPLICATE_NAME_ERROR = "A project with this name already exists.";
const MISSING_PROJECT_ERROR = "That project is no longer available.";
const EMPTY_NOTE_TITLE_ERROR = "Give the note a title first.";
const MISSING_NOTE_ERROR = "That note is no longer available.";
const EMPTY_DECISION_ERROR = "Describe the decision first.";
const EMPTY_RATIONALE_ERROR = "Add the reasoning so the decision keeps its why.";
const MISSING_DECISION_ERROR = "That decision is no longer available.";

export function useProjects(): ProjectsController {
  const [data, setData] = useState<ProjectStoreData>(loadProjectStore);
  const [storageError, setStorageError] = useState<string>();

  const commit = useCallback((next: ProjectStoreData) => {
    setData(next);
    const result = persistProjectStore(next);
    setStorageError(result.ok ? undefined : result.error);
  }, []);

  const mutateProject = useCallback(
    (
      id: string,
      update: (project: Project) => Project | null,
      error: string,
    ): ProjectMutationResult => {
      const project = data.projects.find((candidate) => candidate.id === id);
      if (!project) return { ok: false, error: MISSING_PROJECT_ERROR };

      const nextProject = update(project);
      if (!nextProject) return { ok: false, error };
      if (nextProject === project) return { ok: true, project };

      commit({
        projects: data.projects.map((candidate) => (candidate.id === id ? nextProject : candidate)),
      });
      return { ok: true, project: nextProject };
    },
    [commit, data],
  );

  const addProject = useCallback(
    (name: string, description = ""): ProjectMutationResult => {
      const normalizedName = normalizeProjectName(name);
      if (!normalizedName) return { ok: false, error: EMPTY_NAME_ERROR };
      if (findProjectByName(data.projects, normalizedName)) {
        return { ok: false, error: DUPLICATE_NAME_ERROR };
      }

      const project = createProject(normalizedName, description);
      if (!project) return { ok: false, error: EMPTY_NAME_ERROR };

      commit({ projects: [project, ...data.projects] });
      return { ok: true, project };
    },
    [commit, data],
  );

  const renameProject = useCallback(
    (id: string, name: string): ProjectMutationResult => {
      const project = data.projects.find((candidate) => candidate.id === id);
      if (!project) return { ok: false, error: MISSING_PROJECT_ERROR };

      const normalizedName = normalizeProjectName(name);
      if (!normalizedName) return { ok: false, error: EMPTY_NAME_ERROR };
      if (findProjectByName(data.projects, normalizedName, id)) {
        return { ok: false, error: DUPLICATE_NAME_ERROR };
      }

      const nextProject = renameProjectRecord(project, normalizedName);
      if (nextProject === project) return { ok: true, project };

      commit({
        projects: data.projects.map((candidate) => (candidate.id === id ? nextProject : candidate)),
      });
      return { ok: true, project: nextProject };
    },
    [commit, data],
  );

  const updateProjectDescription = useCallback(
    (id: string, description: string): ProjectMutationResult => {
      const project = data.projects.find((candidate) => candidate.id === id);
      if (!project) return { ok: false, error: MISSING_PROJECT_ERROR };

      const nextProject = updateProjectDescriptionRecord(project, description);
      if (nextProject === project) return { ok: true, project };

      commit({
        projects: data.projects.map((candidate) => (candidate.id === id ? nextProject : candidate)),
      });
      return { ok: true, project: nextProject };
    },
    [commit, data],
  );

  const archiveProject = useCallback(
    (id: string): ProjectMutationResult => {
      const project = data.projects.find((candidate) => candidate.id === id);
      if (!project) return { ok: false, error: MISSING_PROJECT_ERROR };

      const nextProject = archiveProjectRecord(project);
      if (nextProject === project) return { ok: true, project };

      commit({
        projects: data.projects.map((candidate) => (candidate.id === id ? nextProject : candidate)),
      });
      return { ok: true, project: nextProject };
    },
    [commit, data],
  );

  const restoreProject = useCallback(
    (id: string): ProjectMutationResult => {
      const project = data.projects.find((candidate) => candidate.id === id);
      if (!project) return { ok: false, error: MISSING_PROJECT_ERROR };

      const nextProject = restoreProjectRecord(project);
      if (nextProject === project) return { ok: true, project };

      commit({
        projects: data.projects.map((candidate) => (candidate.id === id ? nextProject : candidate)),
      });
      return { ok: true, project: nextProject };
    },
    [commit, data],
  );

  const updateProjectFocus = useCallback(
    (id: string, focus: string): ProjectMutationResult =>
      mutateProject(id, (project) => updateProjectFocusRecord(project, focus), MISSING_PROJECT_ERROR),
    [mutateProject],
  );

  const updateProjectResume = useCallback(
    (id: string, note: string): ProjectMutationResult =>
      mutateProject(
        id,
        (project) => updateProjectResumeRecord(project, note),
        MISSING_PROJECT_ERROR,
      ),
    [mutateProject],
  );

  const recordProjectActivity = useCallback(
    (projectIds: string[], at = new Date().toISOString()) => {
      const nextProjects = touchProjectsRecord(data.projects, projectIds, at);
      if (nextProjects === data.projects) return;
      commit({ projects: nextProjects });
    },
    [commit, data],
  );

  const addNote = useCallback(
    (projectId: string, title: string, content = ""): ProjectMutationResult => {
      if (!normalizeProjectName(title)) return { ok: false, error: EMPTY_NOTE_TITLE_ERROR };
      return mutateProject(
        projectId,
        (project) => addProjectNote(project, title, content),
        EMPTY_NOTE_TITLE_ERROR,
      );
    },
    [mutateProject],
  );

  const updateNote = useCallback(
    (
      projectId: string,
      noteId: string,
      title: string,
      content: string,
    ): ProjectMutationResult => {
      if (!normalizeProjectName(title)) return { ok: false, error: EMPTY_NOTE_TITLE_ERROR };
      return mutateProject(
        projectId,
        (project) => updateProjectNote(project, noteId, title, content),
        MISSING_NOTE_ERROR,
      );
    },
    [mutateProject],
  );

  const deleteNote = useCallback(
    (projectId: string, noteId: string): ProjectMutationResult =>
      mutateProject(
        projectId,
        (project) => deleteProjectNote(project, noteId),
        MISSING_NOTE_ERROR,
      ),
    [mutateProject],
  );

  const addDecision = useCallback(
    (projectId: string, statement: string, rationale: string): ProjectMutationResult => {
      if (!normalizeProjectName(statement)) return { ok: false, error: EMPTY_DECISION_ERROR };
      if (!rationale.trim()) return { ok: false, error: EMPTY_RATIONALE_ERROR };
      return mutateProject(
        projectId,
        (project) => addProjectDecision(project, statement, rationale),
        EMPTY_DECISION_ERROR,
      );
    },
    [mutateProject],
  );

  const updateDecision = useCallback(
    (
      projectId: string,
      decisionId: string,
      statement: string,
      rationale: string,
    ): ProjectMutationResult => {
      if (!normalizeProjectName(statement)) return { ok: false, error: EMPTY_DECISION_ERROR };
      if (!rationale.trim()) return { ok: false, error: EMPTY_RATIONALE_ERROR };
      return mutateProject(
        projectId,
        (project) => updateProjectDecision(project, decisionId, statement, rationale),
        MISSING_DECISION_ERROR,
      );
    },
    [mutateProject],
  );

  const deleteDecision = useCallback(
    (projectId: string, decisionId: string): ProjectMutationResult =>
      mutateProject(
        projectId,
        (project) => deleteProjectDecision(project, decisionId),
        MISSING_DECISION_ERROR,
      ),
    [mutateProject],
  );

  return {
    ...data,
    storageError,
    addProject,
    renameProject,
    updateProjectDescription,
    updateProjectFocus,
    updateProjectResume,
    archiveProject,
    restoreProject,
    recordProjectActivity,
    addNote,
    updateNote,
    deleteNote,
    addDecision,
    updateDecision,
    deleteDecision,
  };
}
