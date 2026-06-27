import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMobileAuth } from "../hooks/useMobileAuth";
import MobileAuthView from "../views/pages/mobile/auth/MobileAuth.view";

// Full-screen public route: sign in / sign up. Owns the auth controller. A
// deep-link notice (e.g. "email confirmed") arrives via navigation state.
// Once signed in, leave for the app (the gate only handles the reverse).
export default function AuthRoute() {
  const { user } = useAuth();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const controller = useMobileAuth(notice);

  if (user) return <Navigate to="/today" replace />;

  return <MobileAuthView controller={controller} />;
}
