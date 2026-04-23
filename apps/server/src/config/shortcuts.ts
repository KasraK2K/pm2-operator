export const SHORTCUT_ACTIONS = ["processes", "dashboard", "logs", "clearLogs"] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  processes: "Alt+P",
  dashboard: "Alt+D",
  logs: "Alt+L",
  clearLogs: "Mod+K"
};

