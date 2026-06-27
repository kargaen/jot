import { Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";

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
  const { user } = useAuth();
  const data = useMobileAppData(user?.id ?? null);
  const context: AppOutletContext = { user, data };
  return <Outlet context={context} />;
}
