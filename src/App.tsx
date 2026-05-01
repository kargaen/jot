import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import QuickCapture from "./views/pages/desktop/capture/QuickCapture.view";
import Dashboard from "./views/pages/desktop/dashboard/Dashboard.view";
import TaskDetailWindow from "./views/pages/desktop/tasks/TaskDetailWindow.view";
import ReminderWindow from "./views/pages/desktop/pulse/ReminderWindow.view";
import AboutWindow from "./views/pages/desktop/about/AboutWindow.view";
import MobileApp from "./views/pages/mobile/app/MobileApp.view";
import { logger } from "./utils/observability/logger";
import { startThemeSync } from "./utils/presentation/theme";
import {
  listenForDeepLinks,
  parseDeepLink,
  takePendingDeepLink,
} from "./services/desktop/deepLinks.service";

const windowLabel = getCurrentWebviewWindow().label;
logger.info("app", `window started: ${windowLabel}`);

// F12 opens DevTools in any window
document.addEventListener("keydown", (e) => {
  if (e.key === "F12") (getCurrentWebviewWindow() as any).openDevtools?.();
});

export default function App() {
  const { loading, user } = useAuth();
  const [os, setOs] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      setOs(platform());
    } catch {
      setOs("unknown");
    }
  }, []);

  useEffect(() => startThemeSync(), []);

  useEffect(() => {
    if (windowLabel !== "main") return;

    const handleUrl = (url: string) => {
      const route = parseDeepLink(url);
      logger.info("deep-link", `received: ${url}`);
      if (route.kind === "confirmed") {
        setLaunchNotice("Your email is confirmed. You're all set to keep using Jot.");
        return;
      }
      if (route.kind === "task" && route.id) {
        setLaunchNotice("Jot opened from a task link. Task deep-link navigation is next on the roadmap.");
        return;
      }
      if (route.kind === "project" && route.id) {
        setLaunchNotice("Jot opened from a project link. Project deep-link navigation is next on the roadmap.");
      }
    };

    void takePendingDeepLink().then((url) => {
      if (url) handleUrl(url);
    });

    let unlisten: (() => void) | null = null;
    void listenForDeepLinks(handleUrl).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

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

  if (isMobile) return <MobileApp launchNotice={launchNotice} />;

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
  return <Dashboard launchNotice={launchNotice} />;
}
