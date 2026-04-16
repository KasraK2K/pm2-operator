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

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  colorScheme: "dark" | "light";
  preview: [string, string, string];
}

export const THEMES: ThemeDefinition[] = [
  {
    id: "midnight-ops",
    label: "Midnight Ops",
    description: "Navy surfaces with calm cyan signal accents.",
    colorScheme: "dark",
    preview: ["#08111c", "#13233a", "#5ad0ff"]
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral charcoal for distraction-free triage.",
    colorScheme: "dark",
    preview: ["#15181f", "#262b35", "#9ca7b8"]
  },
  {
    id: "terminal-green",
    label: "Terminal Green",
    description: "Classic phosphor terminal styling for deep log work.",
    colorScheme: "dark",
    preview: ["#061108", "#102316", "#52f08a"]
  },
  {
    id: "ocean-depth",
    label: "Ocean Depth",
    description: "Deep blue with teal highlights and cooler contrast.",
    colorScheme: "dark",
    preview: ["#06141a", "#102833", "#4dd9c2"]
  },
  {
    id: "ember-watch",
    label: "Ember Watch",
    description: "Warm coal base with orange alert-driven accents.",
    colorScheme: "dark",
    preview: ["#160c08", "#2b1810", "#ff8a4c"]
  },
  {
    id: "arctic-light",
    label: "Arctic Light",
    description: "High-clarity light mode for bright rooms and daytime ops.",
    colorScheme: "light",
    preview: ["#eef5fb", "#ffffff", "#2f7dd3"]
  },
  {
    id: "sandstone",
    label: "Sandstone",
    description: "Warm neutral light mode with softer contrast edges.",
    colorScheme: "light",
    preview: ["#f5efe3", "#fffaf1", "#b37426"]
  },
  {
    id: "signal-neon",
    label: "Signal Neon",
    description: "High-energy dark mode with vivid alert and action colors.",
    colorScheme: "dark",
    preview: ["#071017", "#0f1d29", "#d0ff36"]
  }
];

export const THEME_LOOKUP = Object.fromEntries(THEMES.map((theme) => [theme.id, theme])) as Record<
  ThemeId,
  ThemeDefinition
>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
