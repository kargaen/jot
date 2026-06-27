import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";
import Splash from "./Splash.view";

// Shared context handed to every protected route via AppShell's Outlet.
// Child route containers read it with useOutletContext<AppOutletContext>().
export interface AppOutletContext {
  user: ReturnType<typeof useAuth>["user"];
  data: ReturnType<typeof useMobileAppData>;
}

// Protected layout route: owns the single app-data fetch and exposes it to every
// child through the Outlet context, so all screens share one fetch instead of
// each fetching its own. Nav screens nest under the AppShell sub-layout (which
// re-forwards this context); full-screen routes (e.g. task detail) are direct
// children that read the same context without the navbar frame.
export default function AppLayout() {
  const { loading, user } = useAuth();
  const data = useMobileAppData(user?.id ?? null);

  // Gate, mirroring the legacy MobileApp early returns:
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/auth" replace />;
  // Wait for the first load before deciding onboarding, so an empty initial
  // state isn't mistaken for "no spaces".
  if (!data.hasLoaded) return <Splash />;
  if (data.areas.length === 0) return <Navigate to="/onboarding" replace />;

  const context: AppOutletContext = { user, data };
  return <Outlet context={context} />;
}
