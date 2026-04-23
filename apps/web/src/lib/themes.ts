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
    description: "Quiet navy surfaces with balanced cyan signal contrast.",
    colorScheme: "dark",
    preview: ["#09111b", "#111d2b", "#6dbceb"]
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral charcoal tuned for long triage sessions.",
    colorScheme: "dark",
    preview: ["#13161d", "#20242c", "#b9c3d0"]
  },
  {
    id: "terminal-green",
    label: "Terminal Green",
    description: "Phosphor-inspired greens with softer night-shift contrast.",
    colorScheme: "dark",
    preview: ["#071009", "#102417", "#7ad99b"]
  },
  {
    id: "ocean-depth",
    label: "Ocean Depth",
    description: "Cool blue depth with restrained teal operator accents.",
    colorScheme: "dark",
    preview: ["#07131a", "#102733", "#68cec1"]
  },
  {
    id: "ember-watch",
    label: "Ember Watch",
    description: "Warm low-glare amber tones for focused monitoring.",
    colorScheme: "dark",
    preview: ["#170e0a", "#2b1a11", "#e59a61"]
  },
  {
    id: "arctic-light",
    label: "Arctic Light",
    description: "Bright-room light mode with stronger readable contrast.",
    colorScheme: "light",
    preview: ["#f3f7fa", "#f7fafd", "#2568b8"]
  },
  {
    id: "sandstone",
    label: "Sandstone",
    description: "Warm neutral light mode with steadier earthy contrast.",
    colorScheme: "light",
    preview: ["#f6f0e6", "#f9f3ea", "#8c5e24"]
  },
  {
    id: "signal-neon",
    label: "Signal Neon",
    description: "Reduced-neon dark mode with crisp signal highlights.",
    colorScheme: "dark",
    preview: ["#071018", "#101d2a", "#b8dc68"]
  }
];

export const THEME_LOOKUP = Object.fromEntries(THEMES.map((theme) => [theme.id, theme])) as Record<
  ThemeId,
  ThemeDefinition
>;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}
