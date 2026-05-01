import type { NlpLanguageMode } from "../../models/shared";

export const NLP_LANGUAGE_KEY = "jot_nlp_language";

export function loadNlpLanguageMode(): NlpLanguageMode {
  const stored = localStorage.getItem(NLP_LANGUAGE_KEY);
  return stored === "en" || stored === "da" || stored === "auto"
    ? stored
    : "auto";
}

export function saveNlpLanguageMode(mode: NlpLanguageMode) {
  if (mode === "auto") localStorage.removeItem(NLP_LANGUAGE_KEY);
  else localStorage.setItem(NLP_LANGUAGE_KEY, mode);
}
