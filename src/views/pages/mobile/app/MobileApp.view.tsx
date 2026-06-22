import { useAuth } from "../../../../hooks/useAuth";
import { useMobileAuth } from "../../../../hooks/useMobileAuth";
import MobileAuthView from "../auth/MobileAuth.view";

export default function MobileApp({ launchNotice = null }: { launchNotice?: string | null }) {
  const { loading, user } = useAuth();
  const authController = useMobileAuth(launchNotice);

  if (loading) {
    return (
      <div style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg-secondary)",
        color: "var(--text-secondary)",
        fontSize: 14,
      }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <MobileAuthView controller={authController} />;
  }

  // Main app — tabs built in subsequent steps
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg-shell)" }} />
  );
}
