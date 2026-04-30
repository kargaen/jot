import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export default function AboutWindow() {
  const releasesUrl = "https://github.com/kargaen/jot/releases";
  const [version, setVersion] = useState("");
  const [updateState, setUpdateState] = useState<"checking" | "up-to-date" | "available" | "downloading" | "ready" | "failed">("checking");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const updateRef = useRef<Awaited<ReturnType<typeof check>> | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
    check().then((update) => {
      if (update) {
        updateRef.current = update;
        setUpdateVersion(update.version);
        setUpdateState("available");
      } else {
        setUpdateState("up-to-date");
      }
    }).catch(() => setUpdateState("up-to-date"));
  }, []);

  async function handleUpdate() {
    const update = updateRef.current;
    if (!update) return;
    setUpdateState("downloading");
    setUpdateError("");
    setUpdateProgress(0);
    let totalBytes = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) totalBytes = event.data.contentLength;
        else if (event.event === "Progress" && totalBytes > 0) setUpdateProgress((prev) => Math.min(prev + event.data.chunkLength / totalBytes * 100, 100));
        else if (event.event === "Finished") setUpdateState("ready");
      });
      await relaunch();
    } catch (error) {
      setUpdateState("failed");
      setUpdateError(error instanceof Error ? error.message : "Automatic update failed.");
    }
  }

  const row: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 0", borderBottom: "1px solid var(--border-subtle)",
  };

  return (
    <div
      data-tauri-drag-region
      style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)", userSelect: "none" }}
    >
      {/* Titlebar */}
      <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", padding: "12px 16px 0", flexShrink: 0 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>About Jot</span>
        <button
          onClick={() => getCurrentWebviewWindow().close()}
          style={{ fontSize: 18, color: "var(--text-tertiary)", lineHeight: 1, padding: "0 4px", cursor: "pointer" }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "20px 24px", overflow: "auto" }}>
        {/* Logo + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 20 }}>
          <img src="/icon.png" alt="Jot" style={{ width: 48, height: 48, borderRadius: 10 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>Jot</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>Think it. Jot it. Do it.</div>
          </div>
        </div>

        {/* Version */}
        <div style={row}>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Version</div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {version || "..."}
          </span>
        </div>

        {/* Update status */}
        <div style={row}>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Updates</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {updateState === "checking" && (
              <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontStyle: "italic", animation: "jot-pulse-text 1.5s ease-in-out infinite" }}>
                Checking...
              </span>
            )}
            {updateState === "up-to-date" && (
              <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 500 }}>Up to date</span>
            )}
            {updateState === "available" && (
              <>
                <span style={{ fontSize: 12, color: "var(--text-primary)" }}>v{updateVersion} available</span>
                <button
                  onClick={handleUpdate}
                  style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "#fff", cursor: "pointer" }}
                >
                  Update
                </button>
              </>
            )}
            {updateState === "downloading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{Math.round(updateProgress)}%</span>
                <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--bg-tertiary)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${updateProgress}%`, background: "var(--accent)", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
            {updateState === "ready" && (
              <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 500 }}>Restarting...</span>
            )}
            {updateState === "failed" && (
              <>
                <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>Auto update failed</span>
                <button
                  onClick={() => shellOpen(releasesUrl)}
                  style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: "var(--radius-sm)", background: "#dc2626", color: "#fff", cursor: "pointer" }}
                >
                  Download manually
                </button>
              </>
            )}
          </div>
        </div>
        {updateState === "failed" && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
            {updateError || "Please download the latest installer manually from Releases."}
          </div>
        )}

        {/* Created by */}
        <div style={{ ...row, borderBottom: "none" }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>Created by</div>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Karsten Garborg</span>
        </div>

        {/* Links */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-subtle)" }}>
          {[
            { label: "Website", url: "https://kargaen.github.io/jot/" },
            { label: "Release notes", url: "https://github.com/kargaen/jot/releases" },
            { label: "Portfolio", url: "https://kargaen.github.io/" },
          ].map(({ label, url }) => (
            <button
              key={label}
              onClick={() => shellOpen(url)}
              style={{ fontSize: 12, color: "var(--accent)", cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline", fontFamily: "inherit" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <style>{`@keyframes jot-pulse-text { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}
