import { useState } from "react";
import type { CSSProperties } from "react";
import type { ParsedInput } from "../../../../models/shared";
import { useAuth } from "../../../../hooks/useAuth";
import { useMobileAuth } from "../../../../hooks/useMobileAuth";
import { useMobileAppData, useCaptureComposer, useMobileAccountActions, useMobileSpacesActions } from "../../../../hooks/useMobileApp";
import MobileAuthView from "../auth/MobileAuth.view";
import MobileTodayView from "../today/MobileToday.view";
import MobileUpcomingView from "../upcoming/MobileUpcoming.view";
import MobileTasksView from "../tasks/MobileTasks.view";
import MobileTaskDetailView from "../tasks/MobileTaskDetail.view";
import MobileCaptureView from "../capture/MobileCapture.view";
import MobileSettingsView from "../settings/MobileSettings.view";
import MobileOnboardingView from "../onboarding/MobileOnboarding.view";
import { logger } from "../../../../utils/observability/logger";

type Tab = "today" | "upcoming" | "tasks" | "capture" | "settings";

export default function MobileApp({ launchNotice = null }: { launchNotice?: string | null }) {
  const { loading, user } = useAuth();
  const authController = useMobileAuth(launchNotice);
  const appData = useMobileAppData(user?.id ?? null);
  const capture = useCaptureComposer();
  const accountActions = useMobileAccountActions();
  const spaceActions = useMobileSpacesActions();
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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
        />
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <TabHeader
        tab={activeTab}
        refreshing={refreshing}
        onNewTask={() => setActiveTab("capture")}
        onRefresh={handleRefresh}
      />
      <div style={styles.screen}>
        {activeTab === "today" && (
          <MobileTodayView
            tasks={appData.visibleTasks}
            loading={appData.loadingData}
            onComplete={appData.completeTask}
          />
        )}
        {activeTab === "upcoming" && (
          <MobileUpcomingView
            tasks={appData.visibleTasks}
            loading={appData.loadingData}
            onComplete={appData.completeTask}
            onOpenTask={(id) => setSelectedTaskId(id)}
          />
        )}
        {activeTab === "tasks" && (
          <MobileTasksView
            tasks={appData.visibleTasks}
            areas={appData.areas}
            projects={appData.visibleProjects}
            loading={appData.loadingData}
            onComplete={appData.completeTask}
            onOpenTask={(id) => setSelectedTaskId(id)}
            onDeleteTask={appData.deleteTask}
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
            hiddenAreaIds={appData.hiddenAreaIds}
            onHiddenChange={appData.handleHiddenChange}
            accountActions={accountActions}
            spaceActions={spaceActions}
            onSignedOut={() => appData.refresh()}
            onAreasChanged={() => appData.refresh()}
          />
        )}
      </div>

      <nav style={styles.tabBar}>
        <TabButton label="Today" icon="☀️" active={activeTab === "today"} onPress={() => setActiveTab("today")} />
        <TabButton label="Upcoming" icon="📅" active={activeTab === "upcoming"} onPress={() => setActiveTab("upcoming")} />
        <TabButton label="Tasks" icon="✓" active={activeTab === "tasks"} onPress={() => setActiveTab("tasks")} />
        <TabButton label="Capture" icon="+" active={activeTab === "capture"} onPress={() => setActiveTab("capture")} />
        <TabButton label="Settings" icon="⚙" active={activeTab === "settings"} onPress={() => setActiveTab("settings")} />
      </nav>

      {appData.error ? (
        <div style={styles.errorBanner}>{appData.error}</div>
      ) : null}
    </div>
  );
}

const TAB_TITLES: Record<Tab, string> = {
  today: "Today",
  upcoming: "Upcoming",
  tasks: "Tasks",
  capture: "Capture",
  settings: "Settings",
};

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
};
