import { Check, ChevronDown, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { THEMES, THEME_LOOKUP, type ThemeId } from "../lib/themes";

interface ThemeMenuProps {
  activeThemeId: ThemeId;
  savedThemeId: ThemeId;
  busy: boolean;
  error: string | null;
  onPreviewTheme: (themeId: ThemeId) => void;
  onClearPreview: () => void;
  onSelectTheme: (themeId: ThemeId) => Promise<void> | void;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
}

export function ThemeMenu({
  activeThemeId,
  savedThemeId,
  busy,
  error,
  onPreviewTheme,
  onClearPreview,
  onSelectTheme
}: ThemeMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;

      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(672, window.innerWidth - 24);
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));

      setPosition({
        top: rect.bottom + 8,
        left,
        width
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current?.contains(event.target as Node) ||
        menuRef.current?.contains(event.target as Node)
      ) {
        return;
      }

      onClearPreview();
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
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

  async function handleSelect(themeId: ThemeId) {
    try {
      await onSelectTheme(themeId);
      onClearPreview();
      setOpen(false);
    } catch {
      // Keep the menu open so the inline error state stays visible.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="button-secondary gap-2"
        onClick={() => {
          if (open) {
            onClearPreview();
          }

          setOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <Palette className="size-4" />
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium text-[color:var(--text)]">
            {activeTheme.label}
          </span>
        </span>
        <ChevronDown
          className={`size-4 text-[color:var(--text-soft)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && position
        ? createPortal(
            <div className="fixed inset-0 z-[120] pointer-events-none">
              <div
                className="panel pointer-events-auto fixed max-h-[calc(100vh-2rem)] overflow-auto p-3"
                onMouseLeave={onClearPreview}
                ref={menuRef}
                style={{
                  top: position.top,
                  left: position.left,
                  width: position.width
                }}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="section-kicker">Theme selector</div>
                    <div className="mt-1 text-sm font-medium text-[color:var(--text)]">
                      Hover to preview, click to save for your account.
                    </div>
                  </div>
                  <div className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-soft)] px-2.5 py-1 text-[11px] text-[color:var(--text-soft)]">
                    {busy ? "Saving..." : "8 themes"}
                  </div>
                </div>

                {error ? (
                  <div className="flash mb-3" data-tone="error">
                    {error}
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {THEMES.map((theme) => {
                    const active = theme.id === savedThemeId;

                    return (
                      <button
                        className="theme-card text-left"
                        data-active={active}
                        disabled={busy}
                        key={theme.id}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            onClearPreview();
                          }
                        }}
                        onClick={() => void handleSelect(theme.id)}
                        onFocus={() => onPreviewTheme(theme.id)}
                        onMouseEnter={() => onPreviewTheme(theme.id)}
                        type="button"
                      >
                        <div className="mb-3 flex gap-1.5">
                          {theme.preview.map((swatch) => (
                            <span
                              className="h-8 flex-1 rounded-[0.75rem] border border-black/10"
                              key={`${theme.id}-${swatch}`}
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[color:var(--text)]">
                              {theme.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                              {theme.description}
                            </div>
                          </div>
                          {active ? (
                            <span className="mt-0.5 rounded-full bg-[color:var(--accent-soft)] p-1 text-[color:var(--accent)]">
                              <Check className="size-3.5" />
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
