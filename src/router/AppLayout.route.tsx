import { useEffect } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";
import { useCompletionToast } from "../hooks/useCompletionToast";
import Splash from "./Splash.view";
import Toast from "../views/components/ui/Toast.view";

// Shared context handed to every protected route via AppShell's Outlet.
// Child route containers read it with useOutletContext<AppOutletContext>().
export interface AppOutletContext {
  user: ReturnType<typeof useAuth>["user"];
  data: ReturnType<typeof useMobileAppData>;
  // Complete a task + show the completion toast (list screens).
  onComplete: (id: string) => void;
  // Show the completion toast only (detail screen completes the task itself).
  notify: () => void;
}

// Protected layout route: owns the single app-data fetch and exposes it to every
// child through the Outlet context, so all screens share one fetch instead of
// each fetching its own. Nav screens nest under the AppShell sub-layout (which
// re-forwards this context); full-screen routes (e.g. task detail) are direct
// children that read the same context without the navbar frame.
export default function AppLayout() {
  const { loading, user } = useAuth();
  const data = useMobileAppData(user?.id ?? null);
  const { toast, notify } = useCompletionToast();
  const navigate = useNavigate();

  // Widget launch: when opened from the quick-capture widget (cold or warm
  // start), jump to a clean Capture (the nav state forces a fresh form even if
  // already there) or to Today for a pulse. The pending action is consumed once.
  useEffect(() => {
    if (!user) return;
    async function checkLaunchAction() {
      try {
        const action = await invoke<string | null>("take_mobile_launch_action");
        if (action === "capture" || action === "voice") {
          navigate("/capture", { state: { reset: Date.now() } });
        } else if (action === "pulse") {
          navigate("/today");
        }
      } catch {
        // not on mobile / command unavailable — ignore
      }
    }
    void checkLaunchAction();
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkLaunchAction();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, navigate]);

  // Gate, mirroring the legacy MobileApp early returns:
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/auth" replace />;
  // Wait for the first load before deciding onboarding, so an empty initial
  // state isn't mistaken for "no spaces".
  if (!data.hasLoaded) return <Splash />;
  if (data.areas.length === 0) return <Navigate to="/onboarding" replace />;

  const onComplete = (id: string) => {
    notify();
    void data.completeTask(id);
  };
  const context: AppOutletContext = { user, data, onComplete, notify };

  return (
    <>
      <Outlet context={context} />
      {toast ? <Toast message={toast.quote} badge={`${toast.count} done today`} /> : null}
    </>
  );
}
