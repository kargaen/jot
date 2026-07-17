import { useState } from "react";
import type { NlpLanguageMode } from "../models/shared";
import { loadNlpLanguageMode, saveNlpLanguageMode } from "../services/capture/nlpSettings.service";
import { syncWidgetsDebug } from "../services/sync/widgetSync.service";
import { copyTextToClipboard } from "../services/tauri/clipboard.service";

export function useMobileWidgetSyncDebug() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setResult(await syncWidgetsDebug());
    } finally {
      setBusy(false);
    }
  }

  return { result, busy, run };
}

export function useMobileNlpLanguageMode() {
  const [mode, setMode] = useState<NlpLanguageMode>(loadNlpLanguageMode);

  function selectMode(next: NlpLanguageMode) {
    setMode(next);
    saveNlpLanguageMode(next);
  }

  return { mode, selectMode };
}

export function useCopyRevealedToken() {
  const [copied, setCopied] = useState(false);

  async function copy(revealed: string | null) {
    if (!revealed) return;
    await copyTextToClipboard(revealed);
    setCopied(true);
  }

  return { copied, setCopied, copy };
}
