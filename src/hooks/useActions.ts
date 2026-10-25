import { useCallback, useState } from "react";
import {
  completeActionRecord,
  createAction,
  createInboxItem,
  loadActionStore,
  localDateKey,
  persistActionStore,
  reopenActionRecord,
  updateActionRecord,
  type ActionChanges,
  type ActionStoreData,
  type EffortMinutes,
  type Importance,
} from "../actionStore";

export interface ActionDraft {
  title: string;
  dueDate?: string;
  importance?: Importance;
  effortMinutes?: EffortMinutes;
  projectId?: string;
}

export interface ActionsOptions {
  /**
   * Reports linked projects whose context changed because of action work. The
   * project store owns the timestamp so actions never carry a second copy of it.
   */
  onProjectActivity?: (projectIds: string[], at: string) => void;
}

export interface ActionsController extends ActionStoreData {
  storageError?: string;
  addAction: (draft: ActionDraft) => void;
  updateAction: (id: string, changes: ActionChanges) => void;
  completeAction: (id: string) => void;
  reopenAction: (id: string) => void;
  focusActionToday: (id: string, date?: string) => void;
  removeActionFocus: (id: string) => void;
  deleteAction: (id: string) => void;
  addInboxItem: (title: string) => void;
  updateInboxItem: (id: string, title: string) => void;
  convertInboxItem: (id: string, projectId?: string) => void;
  deleteInboxItem: (id: string) => void;
}

function affectedProjectIds(...ids: (string | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export function useActions({ onProjectActivity }: ActionsOptions = {}): ActionsController {
  const [data, setData] = useState<ActionStoreData>(loadActionStore);
  const [storageError, setStorageError] = useState<string>();

  const commit = useCallback((next: ActionStoreData) => {
    setData(next);
    const result = persistActionStore(next);
    setStorageError(result.ok ? undefined : result.error);
  }, []);

  const addAction = useCallback(
    ({ title, dueDate, importance, effortMinutes, projectId }: ActionDraft) => {
      if (!title.trim()) return;
      const action = createAction(title, { dueDate, importance, effortMinutes, projectId });
      commit({ ...data, actions: [action, ...data.actions] });
      if (action.projectId) onProjectActivity?.([action.projectId], action.createdAt);
    },
    [commit, data, onProjectActivity],
  );

  const updateAction = useCallback(
    (id: string, changes: ActionChanges) => {
      const title = changes.title?.trim();
      if (changes.title !== undefined && !title) return;

      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action) return;

      const next = updateActionRecord(action, { ...changes, ...(title ? { title } : {}) });
      // Saving the same values is not activity, so nothing is persisted.
      if (next === action) return;

      commit({
        ...data,
        actions: data.actions.map((candidate) => (candidate.id === id ? next : candidate)),
      });
      onProjectActivity?.(
        affectedProjectIds(action.projectId, next.projectId),
        next.updatedAt ?? new Date().toISOString(),
      );
    },
    [commit, data, onProjectActivity],
  );

  const completeAction = useCallback(
    (id: string) => {
      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action) return;

      const next = completeActionRecord(action);
      if (next === action) return;

      commit({
        ...data,
        actions: data.actions.map((candidate) => (candidate.id === id ? next : candidate)),
      });
      if (action.projectId) {
        onProjectActivity?.(
          [action.projectId],
          next.completedAt ?? next.updatedAt ?? new Date().toISOString(),
        );
      }
    },
    [commit, data, onProjectActivity],
  );

  const reopenAction = useCallback(
    (id: string) => {
      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action) return;

      const next = reopenActionRecord(action);
      if (next === action) return;

      commit({
        ...data,
        actions: data.actions.map((candidate) => (candidate.id === id ? next : candidate)),
      });
      if (action.projectId) {
        onProjectActivity?.([action.projectId], next.updatedAt ?? new Date().toISOString());
      }
    },
    [commit, data, onProjectActivity],
  );

  // Focus is daily working state, not an edit to the action's context. It stays
  // out of the activity view and does not move any stored timestamps.
  const focusActionToday = useCallback(
    (id: string, date = localDateKey()) => {
      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action || action.status !== "open" || action.focusedDate === date) return;

      commit({
        ...data,
        actions: data.actions.map((candidate) =>
          candidate.id === id ? { ...candidate, focusedDate: date } : candidate,
        ),
      });
    },
    [commit, data],
  );

  const removeActionFocus = useCallback(
    (id: string) => {
      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action?.focusedDate) return;

      commit({
        ...data,
        actions: data.actions.map((candidate) => {
          if (candidate.id !== id) return candidate;
          const { focusedDate: _focusedDate, ...withoutFocus } = candidate;
          return withoutFocus;
        }),
      });
    },
    [commit, data],
  );

  const deleteAction = useCallback(
    (id: string) => {
      const action = data.actions.find((candidate) => candidate.id === id);
      if (!action) return;

      commit({ ...data, actions: data.actions.filter((candidate) => candidate.id !== id) });
      // The action itself is gone, so the project keeps the time of the removal.
      if (action.projectId) onProjectActivity?.([action.projectId], new Date().toISOString());
    },
    [commit, data, onProjectActivity],
  );

  const addInboxItem = useCallback(
    (title: string) => {
      if (!title.trim()) return;
      commit({ ...data, inbox: [createInboxItem(title), ...data.inbox] });
    },
    [commit, data],
  );

  const updateInboxItem = useCallback(
    (id: string, title: string) => {
      const normalizedTitle = title.trim();
      const item = data.inbox.find((candidate) => candidate.id === id);
      if (!item || !normalizedTitle || item.title === normalizedTitle) return;

      commit({
        ...data,
        inbox: data.inbox.map((candidate) =>
          candidate.id === id ? { ...candidate, title: normalizedTitle } : candidate,
        ),
      });
    },
    [commit, data],
  );

  const convertInboxItem = useCallback(
    (id: string, projectId?: string) => {
      const item = data.inbox.find((candidate) => candidate.id === id);
      if (!item) return;

      const action = createAction(item.title, { projectId });
      commit({
        actions: [action, ...data.actions],
        inbox: data.inbox.filter((candidate) => candidate.id !== id),
      });
      if (action.projectId) onProjectActivity?.([action.projectId], action.createdAt);
    },
    [commit, data, onProjectActivity],
  );

  const deleteInboxItem = useCallback(
    (id: string) => {
      if (!data.inbox.some((item) => item.id === id)) return;
      commit({ ...data, inbox: data.inbox.filter((item) => item.id !== id) });
    },
    [commit, data],
  );

  return {
    ...data,
    storageError,
    addAction,
    updateAction,
    completeAction,
    reopenAction,
    focusActionToday,
    removeActionFocus,
    deleteAction,
    addInboxItem,
    updateInboxItem,
    convertInboxItem,
    deleteInboxItem,
  };
}
