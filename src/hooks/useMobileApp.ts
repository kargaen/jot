import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiToken, Area, AreaMember, Project, ProjectMember, Tag, Task, TaskWithTags } from "../models/shared";
import {
  acceptInvite,
  acceptProjectInvite,
  closeProject,
  closeProjectAndCompleteTasks,
  closeProjectAndReleaseTasks,
  completeTask,
  createApiToken,
  createArea,
  createProject,
  createTask,
  declineInvite,
  declineProjectInvite,
  deleteArea,
  deleteTask,
  fetchApiTokens,
  revokeApiToken,
  fetchAllTasks,
  fetchAreaMembers,
  fetchAreas,
  fetchCompletionDates,
  fetchLogbookTasks,
  fetchPendingInvites,
  fetchPendingProjectInvites,
  fetchProjects,
  fetchTags,
  getSession,
  reopenTask,
  inviteMember,
  removeAreaMember,
  signOutEverywhere,
  updateArea,
  updatePassword,
  updateProject,
  updateTask,
} from "../services/backend/supabase.service";
import { logger } from "../utils/observability/logger";
import { drainCaptureOutbox, syncWidgets } from "../services/sync/widgetSync.service";
import { time } from "../utils/observability/timing";
import { saveCreateTaskDraft } from "../controllers/tasks/saveCreateTask.controller";
import { exportTasksToClipboard } from "../controllers/tasks/exportTasks.controller";
import { sortTasksBySchedule } from "../models/tasks/taskPresentation";
import { filterVisibleProjects, filterVisibleTasks, loadHiddenAreas, saveHiddenAreas } from "../utils/preferences/hiddenAreas";
import { copyTextToClipboard } from "../services/tauri/clipboard.service";

// ── Main data + mutations ─────────────────────────────────────────────────────

export function useMobileAppData(userId: string | null) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<TaskWithTags[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstAreaName, setFirstAreaName] = useState("Personal");
  const [firstAreaBusy, setFirstAreaBusy] = useState(false);
  const [firstAreaError, setFirstAreaError] = useState("");
  const [hiddenAreaIds, setHiddenAreaIds] = useState<string[]>(loadHiddenAreas);
  const [logbookTasks, setLogbookTasks] = useState<TaskWithTags[]>([]);
  const [completionDates, setCompletionDates] = useState<string[]>([]);
  const [logbookLoading, setLogbookLoading] = useState(false);
  const areasRef = useRef<Area[]>(areas);
  useEffect(() => { areasRef.current = areas; }, [areas]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoadingData(true);
    setError(null);
    try {
      const [areaRows, projectRows, tagRows, taskRows] = await time("load", () =>
        Promise.all([
          fetchAreas(),
          fetchProjects(),
          fetchTags(),
          fetchAllTasks(),
        ]),
      );
      setAreas(areaRows);
      setProjects(projectRows);
      setTags(tagRows);
      setTasks(sortTasksBySchedule(taskRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
      setHasLoaded(true);
    }
  }, [userId]);

  const refresh = useCallback(async () => {
    await loadData();
    syncWidgets();
    const outboxItems = await drainCaptureOutbox();
    if (outboxItems.length > 0) {
      const defaultAreaId = areasRef.current[0]?.id ?? null;
      await Promise.all(
        outboxItems.map((item) => createTask({ title: item.text, areaId: defaultAreaId })),
      );
      await loadData();
      syncWidgets();
    }
  }, [loadData]);

  // Coalesce widget syncs so a burst of mutations (e.g. rapidly completing
  // tasks) fires one trailing sync instead of one per mutation.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { void syncWidgets(); }, 400);
  }, []);

  // Tasks-only reload — the cheap reconcile used after optimistic mutations
  // (one query instead of the full four).
  const refreshTasks = useCallback(async () => {
    try {
      const rows = await time("load.tasks", () => fetchAllTasks());
      setTasks(sortTasksBySchedule(rows));
    } catch (err) {
      logger.warn("mobile-app", "refreshTasks failed", err instanceof Error ? err.message : err);
    }
  }, []);

  // Apply a just-created task (and any project created alongside it) to local
  // state so capture feels instant without a full refetch.
  const applyCreated = useCallback(
    (result: { task: Task; createdProject: Project | null }) => {
      if (result.createdProject) {
        const created = result.createdProject;
        setProjects((prev) => (prev.some((p) => p.id === created.id) ? prev : [...prev, created]));
      }
      setTasks((prev) => sortTasksBySchedule([{ ...result.task, tags: [] } as TaskWithTags, ...prev]));
      scheduleSync();
    },
    [scheduleSync],
  );

  useEffect(() => {
    if (userId) void refresh();
  }, [userId, refresh]);

  useEffect(() => {
    if (!userId) return;
    async function handleVisible() {
      if (document.visibilityState !== "visible") return;
      const items = await drainCaptureOutbox();
      if (items.length === 0) return;
      const defaultAreaId = areasRef.current[0]?.id ?? null;
      await Promise.all(items.map((item) => createTask({ title: item.text, areaId: defaultAreaId })));
      await loadData();
      syncWidgets();
    }
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [userId, loadData]);

  async function createFirstArea(): Promise<Area | null> {
    if (!firstAreaName.trim()) return null;
    setFirstAreaBusy(true);
    setFirstAreaError("");
    try {
      const session = await getSession();
      if (!session) {
        setFirstAreaError("Your session is not ready yet. Please sign out and sign back in now that your email is confirmed.");
        return null;
      }
      const area = await createArea(firstAreaName.trim());
      await loadData();
      return area;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      let userMessage = message;
      if (message.includes("42501") || message.toLowerCase().includes("row-level security")) {
        userMessage = "Jot could not create your first space because the session was rejected by the server. Please sign out and sign back in, then try again.";
      } else if (message.toLowerCase().includes("not authenticated")) {
        userMessage = "You need to be signed in before creating your first space. Please sign in again and retry.";
      }
      setFirstAreaError(userMessage);
      return null;
    } finally {
      setFirstAreaBusy(false);
    }
  }

  // Optimistic mutations: update local state immediately + keep the widget
  // fresh (syncWidgets), skipping the blocking 4-query refresh(). On failure,
  // reconcile from the server (tasks only). No task write has server
  // side-effects (only trigger is updated_at), so local state is authoritative.
  async function markComplete(id: string) {
    const nowIso = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "completed", completed_at: nowIso } : t)),
    );
    try {
      await time("complete", () => completeTask(id));
    } catch (err) {
      logger.error("mobile-app", "completeTask failed", err instanceof Error ? err.message : err);
      // Revert only this task so concurrent in-flight completes aren't clobbered.
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "todo", completed_at: null } : t)));
      return;
    }
    scheduleSync();
  }
  async function archiveProject(id: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, status: "completed" } : p)));
    try {
      await closeProject(id);
    } catch (err) {
      logger.error("mobile-app", "closeProject failed", err instanceof Error ? err.message : err);
      await refresh();
    }
  }
  async function editTask(id: string, fields: Parameters<typeof updateTask>[1]) {
    const prior = tasks.find((t) => t.id === id);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, ...(fields as Partial<TaskWithTags>), updated_at: new Date().toISOString() } : t,
      ),
    );
    try {
      await time("edit", () => updateTask(id, fields));
    } catch (err) {
      logger.error("mobile-app", "updateTask failed", err instanceof Error ? err.message : err);
      if (prior) setTasks((prev) => prev.map((t) => (t.id === id ? prior : t)));
      return;
    }
    scheduleSync();
  }
  async function removeTask(id: string) {
    const removed = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await time("delete", () => deleteTask(id));
    } catch (err) {
      logger.error("mobile-app", "deleteTask failed", err instanceof Error ? err.message : err);
      if (removed) setTasks((prev) => (prev.some((t) => t.id === id) ? prev : [removed, ...prev]));
      return;
    }
    scheduleSync();
  }
  async function restoreTask(id: string) {
    await reopenTask(id);
    await Promise.all([refreshTasks(), loadLogbook()]);
  }

  const handleHiddenChange = useCallback((ids: string[]) => {
    setHiddenAreaIds(ids);
    saveHiddenAreas(ids);
  }, []);

  const loadLogbook = useCallback(async () => {
    setLogbookLoading(true);
    try {
      // ~16 weeks back to feed the completion heatmap.
      const since = new Date(Date.now() - 16 * 7 * 86400000).toISOString();
      const [tasks, dates] = await Promise.all([
        fetchLogbookTasks(),
        fetchCompletionDates(since),
      ]);
      setLogbookTasks(tasks);
      setCompletionDates(dates);
    } catch (err) {
      logger.warn("mobile", "loadLogbook failed", err instanceof Error ? err.message : err);
    } finally {
      setLogbookLoading(false);
    }
  }, []);

  const visibleTasks = useMemo(
    () => filterVisibleTasks(tasks, projects, hiddenAreaIds),
    [tasks, projects, hiddenAreaIds],
  );
  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects, hiddenAreaIds),
    [projects, hiddenAreaIds],
  );

  return {
    areas, projects, tags, tasks, loadingData, hasLoaded, error,
    visibleTasks, visibleProjects,
    hiddenAreaIds, handleHiddenChange,
    logbookTasks, completionDates, logbookLoading, loadLogbook,
    reopenTask: restoreTask,
    loadData, refresh, refreshTasks, applyCreated,
    firstAreaName, setFirstAreaName, firstAreaBusy, firstAreaError,
    createFirstArea,
    completeTask: markComplete,
    closeProject: archiveProject,
    updateTask: editTask,
    deleteTask: removeTask,
  };
}

// ── Spaces settings ───────────────────────────────────────────────────────────

export function useMobileSpacesActions() {
  return {
    saveArea: (id: string, name: string) => updateArea(id, { name }),
    removeArea: (id: string) => deleteArea(id),
    addArea: (name: string) => createArea(name),
  };
}

// ── Projects settings ─────────────────────────────────────────────────────────

export function useMobileProjectsActions() {
  return {
    addProject: (name: string, areaId: string | null) => createProject(name, areaId),
    renameProject: (id: string, name: string) => updateProject(id, { name }),
    // Mirrors the desktop "Close project" flow: closing sets the project
    // to completed; remaining open tasks are either completed (→ Logbook)
    // or released (unlinked, kept in their space).
    closeProject: (id: string) => closeProject(id),
    closeProjectWithTasks: (id: string, action: "complete" | "release") =>
      action === "complete"
        ? closeProjectAndCompleteTasks(id)
        : closeProjectAndReleaseTasks(id),
  };
}

// ── Sharing settings ──────────────────────────────────────────────────────────

export function useMobileSharingSettings(areas: Area[], currentUserId: string) {
  const ownedAreas = areas.filter((a) => a.user_id === currentUserId);

  const [selectedAreaId, setSelectedAreaId] = useState<string>(ownedAreas[0]?.id ?? "");
  const [members, setMembers] = useState<AreaMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<AreaMember[]>([]);
  const [pendingProjectInvites, setPendingProjectInvites] = useState<ProjectMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchPendingInvites().then(setPendingInvites).catch((err: unknown) => { logger.warn("mobile-app", "fetchPendingInvites failed", err instanceof Error ? err.message : err); });
    void fetchPendingProjectInvites().then(setPendingProjectInvites).catch((err: unknown) => { logger.warn("mobile-app", "fetchPendingProjectInvites failed", err instanceof Error ? err.message : err); });
  }, []);

  useEffect(() => {
    if (!selectedAreaId) return;
    void fetchAreaMembers(selectedAreaId).then(setMembers).catch((err: unknown) => { logger.warn("mobile-app", "fetchAreaMembers failed", err instanceof Error ? err.message : err); });
  }, [selectedAreaId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAreaId || !inviteEmail.trim()) return;
    setBusy(true);
    setError("");
    const err = await inviteMember(selectedAreaId, inviteEmail.trim());
    if (err) {
      setError(err);
    } else {
      setInviteEmail("");
      const nextMembers = await fetchAreaMembers(selectedAreaId);
      setMembers(nextMembers);
    }
    setBusy(false);
  }

  function handleAccept(id: string) {
    void acceptInvite(id).then(() =>
      setPendingInvites((prev) => prev.filter((item) => item.id !== id)),
    );
  }

  function handleDecline(id: string) {
    void declineInvite(id).then(() =>
      setPendingInvites((prev) => prev.filter((item) => item.id !== id)),
    );
  }

  function handleRemove(id: string) {
    void removeAreaMember(id).then(() =>
      setMembers((prev) => prev.filter((item) => item.id !== id)),
    );
  }

  function handleAcceptProject(id: string) {
    void acceptProjectInvite(id).then(() =>
      setPendingProjectInvites((prev) => prev.filter((item) => item.id !== id)),
    );
  }

  function handleDeclineProject(id: string) {
    void declineProjectInvite(id).then(() =>
      setPendingProjectInvites((prev) => prev.filter((item) => item.id !== id)),
    );
  }

  return {
    ownedAreas,
    selectedAreaId, setSelectedAreaId,
    members,
    pendingInvites,
    pendingProjectInvites,
    inviteEmail, setInviteEmail,
    busy, error,
    handleInvite, handleAccept, handleDecline, handleRemove,
    handleAcceptProject, handleDeclineProject,
  };
}

// ── Account settings ──────────────────────────────────────────────────────────

export function useMobileAccountActions() {
  return {
    changePassword: (password: string) => updatePassword(password),
    signOutAll: () => signOutEverywhere(),
  };
}

// ── API tokens (Conduit) ────────────────────────────────────────────────────────

export function useApiTokensActions() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTokens(await fetchApiTokens());
    } catch (err) {
      logger.warn("mobile-app", "fetchApiTokens failed", err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    tokens,
    loading,
    refresh,
    generate: (name: string) => createApiToken(name),
    revoke: (id: string) => revokeApiToken(id),
  };
}

// ── Capture composer ──────────────────────────────────────────────────────────

export function useCaptureComposer() {
  return {
    saveDraft: (input: Parameters<typeof saveCreateTaskDraft>[1]) =>
      saveCreateTaskDraft({ createProject, createTask }, input),
  };
}

// ── Task export ───────────────────────────────────────────────────────────────

export function useMobileTaskExport() {
  return useCallback(
    (tasks: Parameters<typeof exportTasksToClipboard>[1]) =>
      exportTasksToClipboard({ copyToClipboard: copyTextToClipboard }, tasks),
    [],
  );
}
