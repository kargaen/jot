import ReactDOM from "react-dom/client";
import DesktopAuthScreen, {
  type DesktopAuthActions,
} from "../views/components/auth/DesktopAuthScreen.view";
import "../styles/global.css";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const auth: DesktopAuthActions = {
  async signIn(email) {
    await wait(120);
    return {
      ok: false,
      kind: "invalid_credentials",
      message: `Mock sign-in failed for ${email || "this account"}.`,
    };
  },
  async signUp() {
    await wait(120);
    return {
      ok: true,
      kind: "confirmation_sent",
      message: "Check your email to confirm your account.",
    };
  },
  async resendSignupConfirmation() {
    await wait(120);
    return {
      ok: true,
      kind: "confirmation_resent",
      message: "A fresh confirmation email is on its way if this signup is still pending.",
    };
  },
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <DesktopAuthScreen auth={auth} resendCooldownSeconds={1} />,
);
