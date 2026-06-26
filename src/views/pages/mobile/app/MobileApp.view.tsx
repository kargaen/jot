import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ParsedInput } from "../../../../models/shared";
import { randomCompletionMessage } from "../../../../utils/presentation/completionMessage";
import { useAuth } from "../../../../hooks/useAuth";
import { useMobileAuth } from "../../../../hooks/useMobileAuth";
import { useMobileAppData, useCaptureComposer, useMobileAccountActions, useMobileSpacesActions, useMobileProjectsActions } from "../../../../hooks/useMobileApp";
import MobileAuthView from "../auth/MobileAuth.view";
import MobileTodayView from "../today/MobileToday.view";
import MobileUpcomingView from "../upcoming/MobileUpcoming.view";
import MobileTasksView from "../tasks/MobileTasks.view";
import MobileLogbookView from "../logbook/MobileLogbook.view";
import MobileTaskDetailView from "../tasks/MobileTaskDetail.view";
import MobileCaptureView from "../capture/MobileCapture.view";
import MobileSettingsView from "../settings/MobileSettings.view";
import MobileOnboardingView from "../onboarding/MobileOnboarding.view";
import { logger } from "../../../../utils/observability/logger";

type Tab = "today" | "upcoming" | "tasks" | "logbook" | "capture" | "settings";

export default function MobileApp({ launchNotice = null }: { launchNotice?: string | null }) {
  const { loading, user } = useAuth();
  const authController = useMobileAuth(launchNotice);
  const appData = useMobileAppData(user?.id ?? null);
  const capture = useCaptureComposer();
  const accountActions = useMobileAccountActions();
  const spaceActions = useMobileSpacesActions();
  const projectActions = useMobileProjectsActions();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ quote: string; count: number } | null>(null);
  const completedRef = useRef<{ date: string; count: number }>({ date: "", count: 0 });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { loadLogbook, completeTask } = appData;
  useEffect(() => {
    if (activeTab === "logbook") void loadLogbook();
  }, [activeTab, loadLogbook]);

  // Android hardware back: unwind in-app navigation (open menu, task detail,
  // non-default tab) one step per press before letting the system exit.
  const backStateRef = useRef({ menuOpen, selectedTaskId, activeTab });
  backStateRef.current = { menuOpen, selectedTaskId, activeTab };
  useEffect(() => {
    window.history.pushState({ jotNav: true }, "");
    const onPopState = () => {
      const state = backStateRef.current;
      let handled = true;
      if (state.menuOpen) setMenuOpen(false);
      else if (state.selectedTaskId) { setSelectedTaskId(null); setActiveTab("tasks"); }
      else if (state.activeTab !== "today") setActiveTab("today");
      else handled = false;
      if (handled) {
        window.history.pushState({ jotNav: true }, "");
      } else {
        window.removeEventListener("popstate", onPopState);
        window.history.back();
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function showCompletionToast() {
    const today = new Date().toISOString().split("T")[0];
    if (completedRef.current.date !== today) completedRef.current = { date: today, count: 0 };
    completedRef.current.count += 1;
    setToast({ quote: randomCompletionMessage(), count: completedRef.current.count });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  async function handleComplete(id: string) {
    showCompletionToast();
    await completeTask(id);
  }

  async function handleCaptureSave(parsed: ParsedInput) {
    try {
      const result = await capture.saveDraft({
        title: parsed.title,
        projectId: parsed.project?.id ?? null,
        projectName: parsed.suggestedProjectName ?? undefined,
        dueDate: parsed.dueDate ?? null,
        dueTime: parsed.dueTime ?? null,
        priority: parsed.priority,
        recurrenceRule: parsed.recurrenceRule ?? null,
        tagIds: parsed.tags.map((t) => t.id),
        projects: appData.projects,
      });
      await appData.refresh();
      setSelectedTaskId(result.task.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRls = msg.includes("42501") || msg.toLowerCase().includes("row-level security");
      const isAuth = msg.toLowerCase().includes("not authenticated") || msg.toLowerCase().includes("jwt");
      if (isRls || isAuth) {
        logger.error("capture", `save blocked — session/RLS: ${msg}`);
        throw new Error("Your session may have expired. Please sign out and sign back in, then try again.");
      }
      logger.error("capture", `save failed: ${msg}`);
      throw err;
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await appData.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.splash}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <MobileAuthView controller={authController} />;
  }

  if (!appData.loadingData && appData.areas.length === 0) {
    return (
      <MobileOnboardingView
        name={appData.firstAreaName}
        setName={appData.setFirstAreaName}
        busy={appData.firstAreaBusy}
        error={appData.firstAreaError}
        onSubmit={async () => { await appData.createFirstArea(); }}
      />
    );
  }

  const selectedTask = selectedTaskId
    ? appData.tasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  if (selectedTask) {
    return (
      <div style={styles.shell}>
        <MobileTaskDetailView
          task={selectedTask}
          projects={appData.projects}
          areas={appData.areas}
          allTags={appData.tags}
          onUpdated={appData.refresh}
          onBack={() => { setSelectedTaskId(null); setActiveTab("tasks"); }}
          onCompleted={() => { showCompletionToast(); setSelectedTaskId(null); setActiveTab("tasks"); }}
        />
      </div>
    );
  }

  const isTimeView = activeTab === "today" || activeTab === "upcoming" || activeTab === "logbook";

  return (
    <div style={styles.shell}>
      <TabHeader
        tab={activeTab}
        refreshing={refreshing}
        onNewTask={() => setActiveTab("capture")}
        onRefresh={handleRefresh}
      />
      {isTimeView ? (
        <div style={styles.subSwitch}>
          {TIME_VIEWS.map((v) => {
            const active = activeTab === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => { setActiveTab(v.id); setMenuOpen(false); }}
                style={{
                  ...styles.subSwitchItem,
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  borderBottomColor: active ? "var(--accent)" : "transparent",
                }}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={styles.screen}>
        {activeTab === "today" && (
          <MobileTodayView
            tasks={appData.visibleTasks}
            loading={appData.loadingData}
            onComplete={handleComplete}
          />
        )}
        {activeTab === "upcoming" && (
          <MobileUpcomingView
            tasks={appData.visibleTasks}
            loading={appData.loadingData}
            onComplete={handleComplete}
            onOpenTask={(id) => setSelectedTaskId(id)}
          />
        )}
        {activeTab === "tasks" && (
          <MobileTasksView
            tasks={appData.visibleTasks}
            areas={appData.areas}
            projects={appData.visibleProjects}
            loading={appData.loadingData}
            onComplete={handleComplete}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onDeleteTask={appData.deleteTask}
          />
        )}
        {activeTab === "logbook" && (
          <MobileLogbookView
            tasks={appData.logbookTasks}
            loading={appData.logbookLoading}
            completionDates={appData.completionDates}
            onRestore={appData.reopenTask}
          />
        )}
        {activeTab === "capture" && (
          <MobileCaptureView
            projects={appData.projects}
            tags={appData.tags}
            onSave={handleCaptureSave}
          />
        )}
        {activeTab === "settings" && (
          <MobileSettingsView
            email={user.email ?? ""}
            areas={appData.areas}
            projects={appData.projects}
            tasks={appData.tasks}
            hiddenAreaIds={appData.hiddenAreaIds}
            onHiddenChange={appData.handleHiddenChange}
            accountActions={accountActions}
            spaceActions={spaceActions}
            projectActions={projectActions}
            onSignedOut={() => appData.refresh()}
            onAreasChanged={() => appData.refresh()}
          />
        )}
      </div>

      {menuOpen ? (
        <>
          <div style={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
          <div style={styles.menu}>
            {TIME_VIEWS.map((v) => {
              const active = activeTab === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { setActiveTab(v.id); setMenuOpen(false); }}
                  style={styles.menuItem}
                >
                  <span style={{ fontSize: 16, width: 22, textAlign: "center" }}>{v.icon}</span>
                  <span style={{ ...styles.menuItemLabel, color: active ? "var(--accent)" : "var(--text-primary)" }}>
                    {v.label}
                  </span>
                  {active ? <span style={styles.menuCheck}>✓</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <nav style={styles.tabBar}>
        <LauncherButton
          label="Tasks"
          icon="✓"
          active={isTimeView}
          open={menuOpen}
          onPress={() => setMenuOpen((o) => !o)}
        />
        <TabButton label="All" icon="≣" active={activeTab === "tasks"} onPress={() => { setActiveTab("tasks"); setMenuOpen(false); }} />
        <TabButton label="Capture" icon="+" active={activeTab === "capture"} onPress={() => { setActiveTab("capture"); setMenuOpen(false); }} />
        <TabButton label="Settings" icon="⚙" active={activeTab === "settings"} onPress={() => { setActiveTab("settings"); setMenuOpen(false); }} />
      </nav>

      {toast ? (
        <div style={styles.toast}>
          <span style={styles.toastQuote}>{toast.quote}</span>
          <span style={styles.toastCount}>{toast.count} done today</span>
        </div>
      ) : null}

      {appData.error ? (
        <div style={styles.errorBanner}>{appData.error}</div>
      ) : null}
    </div>
  );
}

const TAB_TITLES: Record<Tab, string> = {
  today: "Today",
  upcoming: "Upcoming",
  tasks: "All",
  logbook: "Logbook",
  capture: "Capture",
  settings: "Settings",
};

const TIME_VIEWS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "☀️" },
  { id: "upcoming", label: "Upcoming", icon: "📅" },
  { id: "logbook", label: "Logbook", icon: "◎" },
];

function TabHeader({ tab, refreshing, onNewTask, onRefresh }: {
  tab: Tab;
  refreshing: boolean;
  onNewTask: () => void;
  onRefresh: () => void;
}) {
  return (
    <header style={styles.header}>
      <span style={styles.headerTitle}>{TAB_TITLES[tab]}</span>
      <div style={styles.headerActions}>
        {(tab === "today" || tab === "upcoming" || tab === "tasks") && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            style={styles.headerRefresh}
            aria-label="Refresh"
          >
            <span style={{ opacity: refreshing ? 0.4 : 1 }}>↻</span>
          </button>
        )}
        {tab === "tasks" && (
          <button type="button" onClick={onNewTask} style={styles.headerAction} aria-label="New task">
            +
          </button>
        )}
      </div>
    </header>
  );
}

function TabButton({ label, icon, active, onPress }: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button type="button" onClick={onPress} style={styles.tabButton}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ ...styles.tabLabel, color: active ? "var(--accent)" : "var(--text-secondary)" }}>
        {label}
      </span>
    </button>
  );
}

function LauncherButton({ label, icon, active, open, onPress }: {
  label: string;
  icon: string;
  active: boolean;
  open: boolean;
  onPress: () => void;
}) {
  const color = active || open ? "var(--accent)" : "var(--text-secondary)";
  return (
    <button type="button" onClick={onPress} style={styles.tabButton} aria-haspopup="menu" aria-expanded={open}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ ...styles.tabLabel, color }}>
        {label} <span style={{ fontSize: 8 }}>{open ? "▴" : "▾"}</span>
      </span>
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px 12px",
    paddingTop: "calc(16px + env(safe-area-inset-top))",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-primary)",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "var(--text-primary)",
    letterSpacing: -0.3,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerRefresh: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "1px solid var(--border-default)",
    background: "var(--surface-glass)",
    color: "var(--text-secondary)",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
  },
  headerAction: {
    width: 34,
    height: 34,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #5b5bd6, #7a6cff)",
    color: "#fff",
    fontSize: 22,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "inherit",
    boxShadow: "0 4px 12px rgba(91,91,214,0.30)",
  },
  splash: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    fontSize: 14,
  },
  shell: {
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-primary)",
  },
  screen: {
    flex: 1,
    overflowY: "auto",
  },
  subSwitch: {
    display: "flex",
    gap: 4,
    padding: "0 16px",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--bg-primary)",
  },
  subSwitchItem: {
    padding: "10px 8px 9px",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    marginBottom: -1,
  },
  menuBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 40,
    background: "transparent",
  },
  menu: {
    position: "fixed",
    left: 12,
    bottom: "calc(64px + env(safe-area-inset-bottom))",
    zIndex: 41,
    minWidth: 184,
    padding: 6,
    borderRadius: 14,
    background: "var(--bg-primary)",
    border: "1px solid var(--border-default)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  menuItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: 500,
  },
  menuCheck: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--accent)",
  },
  tabBar: {
    display: "flex",
    borderTop: "1px solid var(--border-default)",
    background: "var(--surface-glass)",
    backdropFilter: "blur(12px)",
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  tabButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    padding: "10px 0 8px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: 0.2,
  },
  errorBanner: {
    position: "fixed",
    bottom: 80,
    left: 16,
    right: 16,
    padding: "10px 14px",
    borderRadius: 12,
    background: "rgba(220,38,38,0.10)",
    color: "#b91c1c",
    fontSize: 13,
  },
  toast: {
    position: "fixed",
    bottom: "calc(76px + env(safe-area-inset-bottom))",
    left: 16,
    right: 16,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    borderRadius: 14,
    background: "rgba(15,139,104,0.12)",
    border: "1px solid rgba(15,139,104,0.28)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
    backdropFilter: "blur(8px)",
  },
  toastQuote: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "#0f8b68",
    lineHeight: 1.3,
  },
  toastCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    color: "#0f8b68",
    background: "rgba(15,139,104,0.16)",
    borderRadius: 10,
    padding: "2px 8px",
  },
};
