export const THEME_IDS = [
  "midnight-ops",
  "graphite",
  "terminal-green",
  "ocean-depth",
  "ember-watch",
  "arctic-light",
  "sandstone",
  "signal-neon"
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME_ID: ThemeId = "midnight-ops";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
