import { useCallback, useEffect, useRef, useState } from "react";
import type { Area, AreaMember, Feedback, Project, ProjectMember, Tag, TaskWithTags } from "../models/shared";
import {
  acceptInvite,
  acceptProjectInvite,
  closeProject,
  completeTask,
  createArea,
  createProject,
  createTask,
  declineInvite,
  declineProjectInvite,
  deleteArea,
  deleteTask,
  fetchAllTasks,
  fetchAreaMembers,
  fetchAreas,
  fetchFeedback,
  fetchPendingInvites,
  fetchPendingProjectInvites,
  fetchProjects,
  fetchTags,
  getSession,
  inviteMember,
  removeAreaMember,
  signOutEverywhere,
  submitFeedback,
  updateArea,
  updatePassword,
  updateTask,
} from "../services/backend/supabase.service";
import { logger } from "../utils/observability/logger";
import { drainCaptureOutbox, syncWidgets } from "../services/sync/widgetSync.service";
import { saveCreateTaskDraft } from "../controllers/tasks/saveCreateTask.controller";
import { sortTasksBySchedule } from "../models/tasks/taskPresentation";

// ── Main data + mutations ─────────────────────────────────────────────────────

export function useMobileAppData(userId: string | null) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<TaskWithTags[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstAreaName, setFirstAreaName] = useState("Personal");
  const [firstAreaBusy, setFirstAreaBusy] = useState(false);
  const [firstAreaError, setFirstAreaError] = useState("");
  const areasRef = useRef<Area[]>(areas);
  useEffect(() => { areasRef.current = areas; }, [areas]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoadingData(true);
    setError(null);
    try {
      const [areaRows, projectRows, tagRows, taskRows] = await Promise.all([
        fetchAreas(),
        fetchProjects(),
        fetchTags(),
        fetchAllTasks(),
      ]);
      setAreas(areaRows);
      setProjects(projectRows);
      setTags(tagRows);
      setTasks(sortTasksBySchedule(taskRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoadingData(false);
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

  async function markComplete(id: string) { await completeTask(id); await refresh(); }
  async function archiveProject(id: string) { await closeProject(id); await refresh(); }
  async function editTask(id: string, fields: Parameters<typeof updateTask>[1]) {
    await updateTask(id, fields);
    await refresh();
  }
  async function removeTask(id: string) { await deleteTask(id); await refresh(); }

  return {
    areas, projects, tags, tasks, loadingData, error,
    loadData, refresh,
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

// ── Feedback settings ─────────────────────────────────────────────────────────

export function useMobileFeedbackSettings() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchFeedback().then(setItems).catch((err: unknown) => { logger.warn("mobile-app", "fetchFeedback failed", err instanceof Error ? err.message : err); });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const item = await submitFeedback(text.trim());
      setItems((prev) => [item, ...prev]);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return { items, text, setText, busy, handleSubmit };
}

// ── Account settings ──────────────────────────────────────────────────────────

export function useMobileAccountActions() {
  return {
    changePassword: (password: string) => updatePassword(password),
    signOutAll: () => signOutEverywhere(),
  };
}

// ── Capture composer ──────────────────────────────────────────────────────────

export function useCaptureComposer() {
  return {
    saveDraft: (input: Parameters<typeof saveCreateTaskDraft>[1]) =>
      saveCreateTaskDraft({ createProject, createTask }, input),
  };
}
