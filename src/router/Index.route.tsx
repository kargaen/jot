import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import Splash from "./Splash.view";

// Decides the initial route once at startup, honoring a pending widget launch
// action. Consuming it here — before any redirect — makes the landing
// deterministic: the old flow redirected to /today first and then raced an
// async navigate to /capture, so a widget "Capture" launch sometimes stuck on
// Today. Warm-start launches are still handled by AppLayout's visibility effect.
export default function IndexRoute() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let dest = "/today";
      try {
        const action = await invoke<string | null>("take_mobile_launch_action");
        if (action === "capture" || action === "voice") dest = "/capture";
        else if (action === "all") dest = "/all";
      } catch {
        // not mobile / command unavailable — default to /today
      }
      if (!cancelled) setTarget(dest);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) return <Splash />;
  return <Navigate to={target} replace />;
}
