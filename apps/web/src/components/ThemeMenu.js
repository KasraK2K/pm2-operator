import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Check, ChevronDown, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { THEMES, THEME_LOOKUP } from "../lib/themes";
export function ThemeMenu({ activeThemeId, savedThemeId, busy, error, onPreviewTheme, onClearPreview, onSelectTheme }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        const handlePointerDown = (event) => {
            if (containerRef.current?.contains(event.target)) {
                return;
            }
            onClearPreview();
            setOpen(false);
        };
        const handleEscape = (event) => {
            if (event.key !== "Escape") {
                return;
            }
            onClearPreview();
            setOpen(false);
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [onClearPreview, open]);
    const activeTheme = THEME_LOOKUP[activeThemeId];
    async function handleSelect(themeId) {
        try {
            await onSelectTheme(themeId);
            onClearPreview();
            setOpen(false);
        }
        catch {
            // Keep the menu open so the inline error state stays visible.
        }
    }
    return (_jsxs("div", { className: "relative", ref: containerRef, children: [_jsxs("button", { className: "button-secondary gap-2", onClick: () => {
                    if (open) {
                        onClearPreview();
                    }
                    setOpen((current) => !current);
                }, type: "button", children: [_jsx(Palette, { className: "size-4" }), _jsxs("span", { className: "hidden text-left sm:block", children: [_jsx("span", { className: "block text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]", children: "Theme" }), _jsx("span", { className: "block text-xs font-medium text-[color:var(--text)]", children: activeTheme.label })] }), _jsx(ChevronDown, { className: `size-4 text-[color:var(--text-soft)] transition ${open ? "rotate-180" : ""}` })] }), open ? (_jsxs("div", { className: "panel absolute right-0 top-full z-30 mt-2 w-[min(42rem,calc(100vw-1.5rem))] p-3", onMouseLeave: onClearPreview, children: [_jsxs("div", { className: "mb-3 flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "section-kicker", children: "Theme selector" }), _jsx("div", { className: "mt-1 text-sm font-medium text-[color:var(--text)]", children: "Hover to preview, click to save for your account." })] }), _jsx("div", { className: "rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2.5 py-1 text-[11px] text-[color:var(--text-soft)]", children: busy ? "Saving..." : "8 themes" })] }), error ? (_jsx("div", { className: "flash mb-3", "data-tone": "error", children: error })) : null, _jsx("div", { className: "grid gap-2 sm:grid-cols-2 xl:grid-cols-4", children: THEMES.map((theme) => {
                            const active = theme.id === savedThemeId;
                            return (_jsxs("button", { className: "theme-card text-left", "data-active": active, disabled: busy, onBlur: (event) => {
                                    if (!event.currentTarget.contains(event.relatedTarget)) {
                                        onClearPreview();
                                    }
                                }, onClick: () => void handleSelect(theme.id), onFocus: () => onPreviewTheme(theme.id), onMouseEnter: () => onPreviewTheme(theme.id), type: "button", children: [_jsx("div", { className: "mb-3 flex gap-1.5", children: theme.preview.map((swatch) => (_jsx("span", { className: "h-8 flex-1 rounded-[0.75rem] border border-black/10", style: { backgroundColor: swatch } }, `${theme.id}-${swatch}`))) }), _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "min-w-0", children: [_jsx("div", { className: "truncate text-sm font-semibold text-[color:var(--text)]", children: theme.label }), _jsx("div", { className: "mt-1 text-xs leading-5 text-[color:var(--text-muted)]", children: theme.description })] }), active ? (_jsx("span", { className: "mt-0.5 rounded-full bg-[color:var(--accent-soft)] p-1 text-[color:var(--accent)]", children: _jsx(Check, { className: "size-3.5" }) })) : null] })] }, theme.id));
                        }) })] })) : null] }));
}
