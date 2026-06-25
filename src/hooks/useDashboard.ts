import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Area, Project, Tag, TaskWithTags } from "../models/shared";
import { filterVisibleProjects, filterVisibleTasks } from "../models/tasks/taskVisibility";
import { loadHiddenAreas, saveHiddenAreas } from "../utils/preferences/hiddenAreas";
import { logger } from "../utils/observability/logger";
import {
  closeDashboardProject,
  closeDashboardProjectWithTasks,
  completeDashboardTask,
  reopenDashboardTask,
  createDashboardArea,
  dashboardErrorMessage,
  deleteDashboardProject,
  loadDashboardLogbook,
  loadDashboardSnapshot,
  mergeDashboardProjects,
  moveDashboardProject,
  moveDashboardTask,
  reorderDashboardProjects,
  reorderDashboardTasks,
  subscribeToDashboardTaskChanges,
} from "../controllers/dashboard/dashboard.controller";

const DEFAULT_AREA_KEY = "jot_default_area";

function loadDefaultAreaId(): string | null {
  return localStorage.getItem(DEFAULT_AREA_KEY);
}

function saveDefaultAreaId(id: string | null) {
  if (id) localStorage.setItem(DEFAULT_AREA_KEY, id);
  else localStorage.removeItem(DEFAULT_AREA_KEY);
}

function sortTasks(tasks: TaskWithTags[], byOrder = false): TaskWithTags[] {
  return [...tasks].sort((a, b) => {
    if (byOrder) {
      const diff = a.sort_order - b.sort_order;
      if (diff !== 0) return diff;
      return a.created_at < b.created_at ? -1 : 1;
    }
    const dueA = a.due_date ?? "9999-99-99";
    const dueB = b.due_date ?? "9999-99-99";
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
  });
}

export type DashboardView =
  | "overdue"
  | "today"
  | "inbox"
  | "upcoming"
  | "project"
  | "logbook";

export interface UseDashboardOptions {
  userId: string | null;
}

export function useDashboard({ userId }: UseDashboardOptions) {
  const [view, setView] = useState<DashboardView>("today");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [allTasks, setAllTasks] = useState<TaskWithTags[]>([]);
  const [logbookTasks, setLogbookTasks] = useState<TaskWithTags[]>([]);
  const [heatmapDates, setHeatmapDates] = useState<string[]>([]);
  const [hiddenAreaIds, setHiddenAreaIds] = useState<string[]>(loadHiddenAreas);
  const [defaultAreaId, setDefaultAreaId] = useState<string | null>(loadDefaultAreaId);
  const [selectedInboxAreaId, setSelectedInboxAreaId] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{ projectId: string; taskCount: number } | null>(
    null,
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingName, setOnboardingName] = useState("Personal");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [suggestClose, setSuggestClose] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  const loadIdRef = useRef(0);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeLastFiredRef = useRef(0);
  const projectsSeenWithTasks = useRef(new Set<string>());
  const today = new Date().toISOString().split("T")[0];

  const loadData = useCallback(async () => {
    const id = ++loadIdRef.current;
    logger.debug("dashboard", `loadData #${id}: fetching…`);
    try {
      const snapshot = await loadDashboardSnapshot();
      if (id !== loadIdRef.current) return;
      setAreas(snapshot.areas);
      setProjects(snapshot.projects);
      setTags(snapshot.tags);
      setAllTasks(snapshot.tasks);
      setShowOnboarding(snapshot.areas.length === 0);

      const savedDefault = loadDefaultAreaId();
      if (
        snapshot.areas.length > 0 &&
        (!savedDefault || !snapshot.areas.some((area) => area.id === savedDefault))
      ) {
        setDefaultAreaId(snapshot.areas[0].id);
        saveDefaultAreaId(snapshot.areas[0].id);
      }

      logger.info(
        "dashboard",
        `loadData #${id}: ${snapshot.tasks.length} tasks, ${snapshot.projects.length} projects`,
      );
    } catch (error) {
      if (id !== loadIdRef.current) return;
      logger.error(
        "dashboard",
        "loadData failed",
        error instanceof Error ? error.message : error,
      );
    }
  }, []);

  useEffect(() => {
    if (userId) void loadData();
  }, [userId, loadData]);

  useEffect(() => {
    setSuggestClose(null);
  }, [selectedProject?.id]);

  useEffect(() => {
    if (!userId || view !== "logbook") return;
    loadDashboardLogbook()
      .then((snapshot) => {
        setLogbookTasks(snapshot.tasks);
        setHeatmapDates(snapshot.heatmapDates);
      })
      .catch((error) => {
        logger.error(
          "dashboard",
          "loadDashboardLogbook failed",
          error instanceof Error ? error.message : error,
        );
      });
  }, [userId, view]);

  useEffect(() => {
    if (!userId) return;
    const THROTTLE_MS = 500;
    const unsubscribe = subscribeToDashboardTaskChanges(() => {
      const now = Date.now();
      const elapsed = now - realtimeLastFiredRef.current;
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      if (elapsed >= THROTTLE_MS) {
        // Leading edge: fire immediately
        realtimeLastFiredRef.current = now;
        void loadData();
      } else {
        // Trailing edge: schedule one reload after the burst settles
        realtimeTimerRef.current = setTimeout(() => {
          realtimeLastFiredRef.current = Date.now();
          void loadData();
        }, THROTTLE_MS - elapsed);
      }
    });

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
      unsubscribe();
    };
  }, [userId, loadData]);

  const visibleProjects = useMemo(
    () => filterVisibleProjects(projects, hiddenAreaIds),
    [projects, hiddenAreaIds],
  );

  const visibleTasks = useMemo(
    () => filterVisibleTasks(allTasks, projects, hiddenAreaIds),
    [allTasks, projects, hiddenAreaIds],
  );

  const overdueTask = useMemo(
    () => visibleTasks.filter((task) => task.due_date && task.due_date < today),
    [visibleTasks, today],
  );

  const todayTasks = useMemo(
    () => visibleTasks.filter((task) => task.due_date === today || task.scheduled_date === today),
    [visibleTasks, today],
  );

  const inboxTasks = useMemo(
    () => visibleTasks.filter((task) => !task.project_id),
    [visibleTasks],
  );

  const upcomingTasks = useMemo(
    () =>
      visibleTasks
        .filter((task) => {
          const date = task.scheduled_date ?? task.due_date;
          return date && date > today;
        })
        .sort((a, b) => {
          const dueA = a.scheduled_date ?? a.due_date ?? "";
          const dueB = b.scheduled_date ?? b.due_date ?? "";
          return dueA < dueB ? -1 : dueA > dueB ? 1 : 0;
        }),
    [visibleTasks, today],
  );

  const projectTasks = useMemo(
    () =>
      selectedProject
        ? visibleTasks.filter((task) => task.project_id === selectedProject.id)
        : [],
    [visibleTasks, selectedProject],
  );

  useEffect(() => {
    for (const task of allTasks) {
      if (task.project_id) projectsSeenWithTasks.current.add(task.project_id);
    }
  }, [allTasks]);

  const areaUrgentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of visibleTasks) {
      if (!task.due_date || task.due_date > today) continue;
      const areaId =
        task.area_id ??
        (task.project_id ? projects.find((project) => project.id === task.project_id)?.area_id : null);
      if (areaId) counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
    }
    return counts;
  }, [visibleTasks, projects, today]);

  const projectUrgentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of visibleTasks) {
      if (task.project_id && task.due_date && task.due_date <= today) {
        counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [visibleTasks, today]);

  const displayTasks = useMemo((): TaskWithTags[] => {
    const raw = (() => {
      switch (view) {
        case "overdue":
          return overdueTask;
        case "today":
          return todayTasks;
        case "inbox":
          return selectedInboxAreaId
            ? visibleTasks.filter(
                (task) =>
                  task.area_id === selectedInboxAreaId ||
                  (task.project_id &&
                    projects.find((project) => project.id === task.project_id)?.area_id ===
                      selectedInboxAreaId),
              )
            : inboxTasks;
        case "upcoming":
          return upcomingTasks;
        case "project":
          return projectTasks;
        case "logbook":
          return logbookTasks;
      }
    })();

    return view === "logbook" ? raw : sortTasks(raw, view === "project");
  }, [
    view,
    overdueTask,
    todayTasks,
    selectedInboxAreaId,
    visibleTasks,
    projects,
    inboxTasks,
    upcomingTasks,
    projectTasks,
    logbookTasks,
  ]);

  const viewTitle =
    view === "overdue"
      ? "Overdue"
      : view === "today"
        ? "Today"
        : view === "inbox"
          ? (areas.find((area) => area.id === selectedInboxAreaId)?.name ?? "Inbox")
          : view === "upcoming"
            ? "Upcoming"
            : view === "logbook"
              ? "Logbook"
              : view === "project" && selectedProject
                ? selectedProject.name
                : "";

  const handleHiddenChange = useCallback(
    (ids: string[]) => {
      setHiddenAreaIds(ids);
      saveHiddenAreas(ids);
      if (selectedInboxAreaId && ids.includes(selectedInboxAreaId)) {
        setSelectedInboxAreaId(null);
        setView("today");
      }
      if (selectedProject?.area_id && ids.includes(selectedProject.area_id)) {
        setSelectedProject(null);
        setView("today");
      }
    },
    [selectedInboxAreaId, selectedProject],
  );

  const setPersistedDefaultAreaId = useCallback((id: string | null) => {
    setDefaultAreaId(id);
    saveDefaultAreaId(id);
  }, []);

  const addProject = useCallback((project: Project) => {
    setProjects((current) => [...current, project]);
  }, []);

  const handleComplete = useCallback(
    (taskId: string) => {
      const task = allTasks.find((item) => item.id === taskId);
      setAllTasks((current) => current.filter((item) => item.id !== taskId));
      completeDashboardTask(taskId).catch((error) => {
        logger.error(
          "dashboard",
          "completeDashboardTask failed",
          error instanceof Error ? error.message : error,
        );
      });

      if (task?.project_id) {
        const remaining = allTasks.filter(
          (item) => item.id !== taskId && item.project_id === task.project_id,
        );
        if (remaining.length === 0 && projectsSeenWithTasks.current.has(task.project_id)) {
          const project = projects.find((item) => item.id === task.project_id);
          if (project) {
            setSuggestClose({ projectId: task.project_id, projectName: project.name });
          }
        }
      }
    },
    [allTasks, projects],
  );

  const handleReopen = useCallback(
    (taskId: string) => {
      // Optimistically drop the row from the logbook, then reopen and reload
      // the open-task data so it returns to the active lists.
      setLogbookTasks((current) => current.filter((item) => item.id !== taskId));
      reopenDashboardTask(taskId)
        .then(() => loadData())
        .catch((error) => {
          logger.error(
            "dashboard",
            "reopenDashboardTask failed",
            error instanceof Error ? error.message : error,
          );
          loadDashboardLogbook()
            .then((snapshot) => setLogbookTasks(snapshot.tasks))
            .catch(() => {});
        });
    },
    [loadData],
  );

  const handleReorder = useCallback((newOrder: TaskWithTags[]) => {
    const updates = newOrder.map((task, index) => ({
      id: task.id,
      sort_order: (index + 1) * 1000,
    }));

    setAllTasks((current) => {
      const nextOrder = new Map(updates.map((update) => [update.id, update.sort_order]));
      return current.map((task) =>
        nextOrder.has(task.id) ? { ...task, sort_order: nextOrder.get(task.id)! } : task,
      );
    });

    reorderDashboardTasks(updates).catch((error) => {
      logger.error(
        "dashboard",
        "reorderDashboardTasks failed",
        error instanceof Error ? error.message : error,
      );
    });
  }, []);

  const handleProjectDrop = useCallback(
    async (
      sourceId: string,
      targetId: string,
      dropMode: "before" | "after" | "merge",
      group: Project[],
    ) => {
      if (!sourceId || sourceId === targetId) return;

      if (dropMode === "merge") {
        const sourceProject = projects.find((project) => project.id === sourceId);
        const targetProject = projects.find((project) => project.id === targetId);
        if (!sourceProject || !targetProject) return;

        const accepted = window.confirm(
          `Merge "${sourceProject.name}" into "${targetProject.name}"?\n\nAll open tasks from "${sourceProject.name}" will move into "${targetProject.name}", and the source project will be deleted.`,
        );
        if (!accepted) return;

        setAllTasks((current) =>
          current.map((task) =>
            task.project_id === sourceId
              ? { ...task, project_id: targetId, area_id: null }
              : task,
          ),
        );
        setProjects((current) => current.filter((project) => project.id !== sourceId));
        if (selectedProject?.id === sourceId) {
          setSelectedProject(targetProject);
          setView("project");
        }

        try {
          await mergeDashboardProjects(sourceId, targetId);
          logger.info("dashboard", `merged project ${sourceId} into ${targetId}`);
          await loadData();
        } catch (error) {
          logger.error(
            "dashboard",
            "mergeDashboardProjects failed",
            error instanceof Error ? error.message : error,
          );
          await loadData();
        }
        return;
      }

      const sourceIndex = group.findIndex((project) => project.id === sourceId);
      const targetIndex = group.findIndex((project) => project.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return;

      const insertAt = dropMode === "before" ? targetIndex : targetIndex + 1;
      const next = [...group];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(insertAt > sourceIndex ? insertAt - 1 : insertAt, 0, moved);

      const updates = next.map((project, index) => ({
        id: project.id,
        sort_order: (index + 1) * 1000,
      }));

      setProjects((current) => {
        const nextOrder = new Map(updates.map((update) => [update.id, update.sort_order]));
        return [...current].sort(
          (a, b) => (nextOrder.get(a.id) ?? a.sort_order) - (nextOrder.get(b.id) ?? b.sort_order),
        );
      });

      reorderDashboardProjects(updates).catch((error) => {
        logger.error(
          "dashboard",
          "reorderDashboardProjects failed",
          error instanceof Error ? error.message : error,
        );
      });
    },
    [projects, selectedProject, loadData],
  );

  const handleMoveTask = useCallback(
    async (taskId: string, projectId: string | null, areaId: string | null) => {
      setAllTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, project_id: projectId, area_id: areaId } : task,
        ),
      );
      await moveDashboardTask(taskId, projectId, areaId);
    },
    [],
  );

  const handleMoveProject = useCallback(
    async (projectId: string, areaId: string) => {
      const area = areas.find((item) => item.id === areaId);
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId ? { ...project, area_id: areaId } : project,
        ),
      );
      if (selectedProject?.id === projectId) {
        setSelectedProject((current) =>
          current ? { ...current, area_id: areaId } : current,
        );
      }
      await moveDashboardProject(projectId, areaId);
      logger.info("dashboard", `moved project ${projectId} to space ${area?.name ?? areaId}`);
    },
    [areas, selectedProject],
  );

  const handleOnboardingCreate = useCallback(async () => {
    if (!onboardingName.trim()) return;
    setOnboardingBusy(true);
    setOnboardingError("");
    try {
      const area = await createDashboardArea(onboardingName);
      setPersistedDefaultAreaId(area.id);
      setShowOnboarding(false);
      await loadData();
    } catch (error) {
      const message = dashboardErrorMessage(error);
      if (message === "SESSION_NOT_READY") {
        setOnboardingError(
          "Your session is not ready yet. Please sign out and sign back in now that your email is confirmed.",
        );
      } else if (message.includes("42501") || message.toLowerCase().includes("row-level security")) {
        setOnboardingError(
          "Jot could not create your first space because the session was rejected by the server. Please sign out and sign back in, then try again.",
        );
      } else if (message.toLowerCase().includes("not authenticated")) {
        setOnboardingError(
          "You need to be signed in before creating your first space. Please sign in again and retry.",
        );
      } else {
        setOnboardingError(message);
      }
    } finally {
      setOnboardingBusy(false);
    }
  }, [onboardingName, loadData, setPersistedDefaultAreaId]);

  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      if (!confirm("Permanently delete this project? Its tasks will move to the inbox.")) return;
      await deleteDashboardProject(projectId);
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setView("inbox");
      }
      await loadData();
    },
    [selectedProject, loadData],
  );

  const handleCloseProject = useCallback(
    async (projectId: string) => {
      const taskCount = allTasks.filter((task) => task.project_id === projectId).length;
      if (taskCount > 0) {
        setCloseDialog({ projectId, taskCount });
        return;
      }
      await closeDashboardProject(projectId);
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setView("inbox");
      }
      await loadData();
    },
    [allTasks, selectedProject, loadData],
  );

  const handleCloseConfirm = useCallback(
    async (action: "complete" | "release") => {
      if (!closeDialog) return;
      const { projectId } = closeDialog;
      await closeDashboardProjectWithTasks(projectId, action);
      setCloseDialog(null);
      if (selectedProject?.id === projectId) {
        setSelectedProject(null);
        setView("inbox");
      }
      await loadData();
    },
    [closeDialog, selectedProject, loadData],
  );

  const handleSuggestedProjectClose = useCallback(async () => {
    if (!suggestClose) return;
    const { projectId } = suggestClose;
    setSuggestClose(null);
    await closeDashboardProject(projectId);
    if (selectedProject?.id === projectId) {
      setSelectedProject(null);
      setView("inbox");
    }
    await loadData();
  }, [suggestClose, selectedProject, loadData]);

  const canManageArea = useCallback(
    (areaId: string) => areas.some((area) => area.id === areaId && area.user_id === userId),
    [areas, userId],
  );

  const canManageProject = useCallback(
    (projectId: string) => {
      const project = projects.find((item) => item.id === projectId);
      return !!project && (project.user_id === userId || (project.area_id ? canManageArea(project.area_id) : false));
    },
    [projects, userId, canManageArea],
  );

  return {
    view,
    setView,
    selectedProject,
    setSelectedProject,
    areas,
    projects,
    tags,
    heatmapDates,
    hiddenAreaIds,
    defaultAreaId,
    selectedInboxAreaId,
    setSelectedInboxAreaId,
    closeDialog,
    setCloseDialog,
    showOnboarding,
    onboardingName,
    setOnboardingName,
    onboardingBusy,
    onboardingError,
    suggestClose,
    setSuggestClose,
    visibleProjects,
    overdueTask,
    todayTasks,
    upcomingTasks,
    displayTasks,
    areaUrgentCounts,
    projectUrgentCounts,
    viewTitle,
    loadData,
    setPersistedDefaultAreaId,
    addProject,
    handleHiddenChange,
    handleComplete,
    handleReopen,
    handleReorder,
    handleProjectDrop,
    handleMoveTask,
    handleMoveProject,
    handleOnboardingCreate,
    handleDeleteProject,
    handleCloseProject,
    handleCloseConfirm,
    handleSuggestedProjectClose,
    canManageArea,
    canManageProject,
  };
}
