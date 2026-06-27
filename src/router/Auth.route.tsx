import { useMobileAuth } from "../hooks/useMobileAuth";
import MobileAuthView from "../views/pages/mobile/auth/MobileAuth.view";

// Full-screen public route: sign in / sign up. Owns the auth controller.
// (launchNotice deep-link messaging is restored in the deep-link slice.)
export default function AuthRoute() {
  const controller = useMobileAuth(null);
  return <MobileAuthView controller={controller} />;
}
