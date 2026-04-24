import { useEffect, useMemo, useState } from "react";

import { DEFAULT_THEME_ID, THEME_LOOKUP, isThemeId, type ThemeId } from "./themes";

const LAST_THEME_KEY = "pm2-operator.last-theme";

function readStoredTheme() {
  const value = localStorage.getItem(LAST_THEME_KEY);
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

function persistTheme(themeId: ThemeId) {
  localStorage.setItem(LAST_THEME_KEY, themeId);
}

export function useTheme(savedThemeId: ThemeId | null) {
  const [storedThemeId, setStoredThemeId] = useState<ThemeId>(() => readStoredTheme());
  const [previewThemeId, setPreviewThemeId] = useState<ThemeId | null>(null);

  useEffect(() => {
    if (!savedThemeId) {
      return;
    }

    setStoredThemeId(savedThemeId);
    persistTheme(savedThemeId);
  }, [savedThemeId]);

  const activeThemeId = useMemo(
    () => previewThemeId ?? savedThemeId ?? storedThemeId ?? DEFAULT_THEME_ID,
    [previewThemeId, savedThemeId, storedThemeId]
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = activeThemeId;
    root.style.colorScheme = THEME_LOOKUP[activeThemeId].colorScheme;
  }, [activeThemeId]);

  return {
    activeThemeId,
    previewThemeId,
    storedThemeId,
    previewTheme(themeId: ThemeId) {
      setPreviewThemeId(themeId);
    },
    clearPreviewTheme() {
      setPreviewThemeId(null);
    },
    commitTheme(themeId: ThemeId) {
      setStoredThemeId(themeId);
      setPreviewThemeId(null);
      persistTheme(themeId);
    }
  };
}
