import type { CSSProperties } from "react";
import Spinner from "../views/components/ui/Spinner.view";

// Full-screen loading state shown while auth resolves or the first data load
// is in flight, before a protected screen can render.
export default function Splash() {
  return (
    <div style={styles.splash}>
      <Spinner size={24} color="var(--text-tertiary)" />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  splash: {
    height: "100dvh",
    display: "grid",
    placeItems: "center",
    background: "var(--bg-secondary)",
  },
};
