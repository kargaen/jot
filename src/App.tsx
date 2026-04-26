import { useEffect, useState } from "react";
import { useAuth } from "./lib/auth";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import QuickCapture from "./windows/QuickCapture";
import Dashboard from "./windows/Dashboard";
import TaskDetailWindow from "./windows/TaskDetailWindow";
import ReminderWindow from "./windows/ReminderWindow";
import AboutWindow from "./windows/AboutWindow";
import MobileApp from "./mobile/MobileApp";
import { logger } from "./lib/logger";
import { startThemeSync } from "./lib/theme";

const windowLabel = getCurrentWebviewWindow().label;
logger.info("app", `window started: ${windowLabel}`);

// F12 opens DevTools in any window
document.addEventListener("keydown", (e) => {
  if (e.key === "F12") (getCurrentWebviewWindow() as any).openDevtools?.();
});

export default function App() {
  const { loading, user } = useAuth();
  const [os, setOs] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOs(platform());
    } catch {
      setOs("unknown");
    }
  }, []);

  useEffect(() => startThemeSync(), []);

  const isMobile = os === "android" || os === "ios";

  if (loading || os === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-secondary)",
          color: "var(--text-tertiary)",
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    );
  }

  if (isMobile) return <MobileApp />;

  if (windowLabel === "quick-capture" && !user) {
    logger.info("app", "quick-capture: not logged in -> opening dashboard");
    invoke("open_dashboard");
    getCurrentWebviewWindow().hide();
    return null;
  }

  if (windowLabel === "quick-capture") return <QuickCapture />;
  if (windowLabel.startsWith("reminder")) return <ReminderWindow />;
  if (windowLabel.startsWith("task-")) return <TaskDetailWindow />;
  if (windowLabel === "about") return <AboutWindow />;
  return <Dashboard />;
}
