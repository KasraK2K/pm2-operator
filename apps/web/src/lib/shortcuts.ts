export type ShortcutAction = "processes" | "dashboard" | "logs" | "clearLogs";
export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  processes: "Alt+P",
  dashboard: "Alt+D",
  logs: "Alt+L",
  clearLogs: "Mod+K"
};

export const SHORTCUT_ACTIONS: Array<{
  id: ShortcutAction;
  label: string;
}> = [
  { id: "processes", label: "Processes" },
  { id: "dashboard", label: "Dashboard" },
  { id: "logs", label: "Logs" },
  { id: "clearLogs", label: "Clear logs" }
];

const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift"]);

function normalizeKey(value: string) {
  if (value === " ") {
    return "Space";
  }

  if (value.length === 1) {
    return value.toUpperCase();
  }

  return value;
}

export function normalizeShortcuts(value: Partial<ShortcutMap> | null | undefined): ShortcutMap {
  return {
    ...DEFAULT_SHORTCUTS,
    ...(value ?? {})
  };
}

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const key = normalizeKey(event.key);
  const modifiers: string[] = [];

  if (event.ctrlKey || event.metaKey) {
    modifiers.push("Mod");
  }

  if (event.altKey) {
    modifiers.push("Alt");
  }

  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  if (modifiers.length === 0 && !/^F\d{1,2}$/.test(key)) {
    return null;
  }

  return [...modifiers, key].join("+");
}

export function formatShortcut(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => {
      if (part === "Mod") {
        return "Ctrl/Cmd";
      }

      if (part === "Meta") {
        return "Cmd";
      }

      return part;
    })
    .join("+");
}

function parseShortcut(shortcut: string) {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.at(-1);

  if (!key) {
    return null;
  }

  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));

  return {
    key: key.toLowerCase(),
    alt: modifiers.has("alt"),
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    meta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
    mod: modifiers.has("mod"),
    shift: modifiers.has("shift")
  };
}

export function eventMatchesShortcut(event: KeyboardEvent, shortcut: string) {
  const parsed = parseShortcut(shortcut);

  if (!parsed) {
    return false;
  }

  if (normalizeKey(event.key).toLowerCase() !== parsed.key) {
    return false;
  }

  const modMatches = parsed.mod ? event.ctrlKey || event.metaKey : true;
  const ctrlMatches = parsed.mod ? true : event.ctrlKey === parsed.ctrl;
  const metaMatches = parsed.mod ? true : event.metaKey === parsed.meta;

  return (
    modMatches &&
    ctrlMatches &&
    metaMatches &&
    event.altKey === parsed.alt &&
    event.shiftKey === parsed.shift
  );
}

