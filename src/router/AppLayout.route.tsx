import { useAuth } from "../hooks/useAuth";
import { useMobileAppData } from "../hooks/useMobileApp";
import AppShell from "./AppShell.view";

// Shared context handed to every protected route via AppShell's Outlet.
// Child route containers read it with useOutletContext<AppOutletContext>().
export interface AppOutletContext {
  user: ReturnType<typeof useAuth>["user"];
  data: ReturnType<typeof useMobileAppData>;
}

// Protected layout route: owns the single app-data fetch and renders the
// presentational AppShell, passing the data down through the Outlet so every
// child screen shares one fetch instead of each fetching its own.
export default function AppLayout() {
  const { user } = useAuth();
  const data = useMobileAppData(user?.id ?? null);
  const context: AppOutletContext = { user, data };
  return <AppShell outletContext={context} />;
}
