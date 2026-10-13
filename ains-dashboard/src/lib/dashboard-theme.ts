import type { InitialConfig } from "@/components/ctds/ThemeController";

// Match the AINS workspace's Spare / calm khaki defaults; preserve vara's icons.
export const dashboardTheme = {
  mode: "light",
  palette: "calm",
  hue: 100,
  shape: "standard",
  density: "default",
  motion: "calm",
  iconFamily: "phosphor",
  lang: "ko",
  focusRing: "on",
  voice: "neutral",
} as const satisfies InitialConfig;
