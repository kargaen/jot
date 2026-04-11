import { useAuth } from "./lib/auth";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import QuickCapture from "./windows/QuickCapture";
import Dashboard from "./windows/Dashboard";
import TaskDetailWindow from "./windows/TaskDetailWindow";
import ReminderWindow from "./windows/ReminderWindow";
import AboutWindow from "./windows/AboutWindow";
import { logger } from "./lib/logger";

const windowLabel = getCurrentWebviewWindow().label;
logger.info("app", `window started: ${windowLabel}`);

// F12 opens DevTools in any window
document.addEventListener("keydown", (e) => {
  if (e.key === "F12") (getCurrentWebviewWindow() as any).openDevtools?.();
});

export default function App() {
  const { loading, user } = useAuth();

  if (loading) {
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
        Loading…
      </div>
    );
  }

  // Quick Capture requires auth — open Dashboard for login instead
  if (windowLabel === "quick-capture" && !user) {
    logger.info("app", "quick-capture: not logged in → opening dashboard");
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
