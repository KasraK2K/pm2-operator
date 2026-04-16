import { useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME_ID, THEME_LOOKUP, isThemeId } from "./themes";
const LAST_THEME_KEY = "pm2-log-viewer.last-theme";
function readStoredTheme() {
    const value = localStorage.getItem(LAST_THEME_KEY);
    return isThemeId(value) ? value : DEFAULT_THEME_ID;
}
function persistTheme(themeId) {
    localStorage.setItem(LAST_THEME_KEY, themeId);
}
export function useTheme(savedThemeId) {
    const [storedThemeId, setStoredThemeId] = useState(() => readStoredTheme());
    const [previewThemeId, setPreviewThemeId] = useState(null);
    useEffect(() => {
        if (!savedThemeId) {
            return;
        }
        setStoredThemeId(savedThemeId);
        persistTheme(savedThemeId);
    }, [savedThemeId]);
    const activeThemeId = useMemo(() => previewThemeId ?? savedThemeId ?? storedThemeId ?? DEFAULT_THEME_ID, [previewThemeId, savedThemeId, storedThemeId]);
    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = activeThemeId;
        root.style.colorScheme = THEME_LOOKUP[activeThemeId].colorScheme;
    }, [activeThemeId]);
    return {
        activeThemeId,
        previewThemeId,
        storedThemeId,
        previewTheme(themeId) {
            setPreviewThemeId(themeId);
        },
        clearPreviewTheme() {
            setPreviewThemeId(null);
        },
        commitTheme(themeId) {
            setStoredThemeId(themeId);
            setPreviewThemeId(null);
            persistTheme(themeId);
        }
    };
}
