// Clipboard access that works in both runtimes: the Tauri plugin inside the
// app (required on Android, where the WebView's navigator.clipboard is
// unreliable), and navigator.clipboard in a plain browser so the visual
// harness can exercise flows that copy.

import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window !== "undefined" && "isTauri" in window) {
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
