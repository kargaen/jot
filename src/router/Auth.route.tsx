import { useLocation } from "react-router-dom";
import { useMobileAuth } from "../hooks/useMobileAuth";
import MobileAuthView from "../views/pages/mobile/auth/MobileAuth.view";

// Full-screen public route: sign in / sign up. Owns the auth controller. A
// deep-link notice (e.g. "email confirmed") arrives via navigation state.
export default function AuthRoute() {
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;
  const controller = useMobileAuth(notice);
  return <MobileAuthView controller={controller} />;
}
