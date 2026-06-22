import { useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "../../../../hooks/useAuth";
import { useMobileAuth } from "../../../../hooks/useMobileAuth";
import { useMobileAppData } from "../../../../hooks/useMobileApp";
import MobileAuthView from "../auth/MobileAuth.view";

type Tab = "today" | "tasks" | "capture" | "settings";

export default function MobileApp({ launchNotice = null }: { launchNotice?: string | null }) {
  const { loading, user } = useAuth();
  const authController = useMobileAuth(launchNotice);
  const appData = useMobileAppData(user?.id ?? null);
  const [activeTab, setActiveTab] = useState<Tab>("today");

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

  return (
    <div style={styles.shell}>
      <div style={styles.screen}>
        {activeTab === "today" && <PlaceholderScreen label="Today" />}
        {activeTab === "tasks" && <PlaceholderScreen label="Tasks" />}
        {activeTab === "capture" && <PlaceholderScreen label="Capture" />}
        {activeTab === "settings" && <PlaceholderScreen label="Settings" />}
      </div>

      <nav style={styles.tabBar}>
        <TabButton label="Today" icon="☀️" active={activeTab === "today"} onPress={() => setActiveTab("today")} />
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

function PlaceholderScreen({ label }: { label: string }) {
  return (
    <div style={styles.placeholder}>
      <span style={styles.placeholderLabel}>{label}</span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
  placeholder: {
    minHeight: "100%",
    display: "grid",
    placeItems: "center",
    color: "var(--text-tertiary)",
  },
  placeholderLabel: {
    fontSize: 14,
    fontWeight: 600,
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
