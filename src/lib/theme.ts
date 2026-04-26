export type AppThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const APP_THEME_KEY = "jot_theme";

export function loadThemePreference(): AppThemePreference {
  const stored = localStorage.getItem(APP_THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export function saveThemePreference(theme: AppThemePreference) {
  if (theme === "system") localStorage.removeItem(APP_THEME_KEY);
  else localStorage.setItem(APP_THEME_KEY, theme);
}

export function getResolvedTheme(
  theme: AppThemePreference = loadThemePreference(),
): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyThemePreference(
  theme: AppThemePreference = loadThemePreference(),
) {
  const root = document.documentElement;
  const resolved = getResolvedTheme(theme);

  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;

  root.style.colorScheme = resolved;
}

export function startThemeSync(onChange?: (theme: AppThemePreference) => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const applyCurrent = () => {
    const theme = loadThemePreference();
    applyThemePreference(theme);
    onChange?.(theme);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === APP_THEME_KEY) applyCurrent();
  };
  const handleMedia = () => {
    if (loadThemePreference() === "system") applyCurrent();
  };

  applyCurrent();
  window.addEventListener("storage", handleStorage);
  media.addEventListener("change", handleMedia);

  return () => {
    window.removeEventListener("storage", handleStorage);
    media.removeEventListener("change", handleMedia);
  };
}
