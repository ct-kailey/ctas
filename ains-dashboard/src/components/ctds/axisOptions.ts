import type {
  DensityValue,
  IconFamily,
  MotionValue,
  PaletteValue,
  ShapeValue,
  VoiceValue,
} from "./_data";

export const PALETTES: PaletteValue[] = ["mono", "vivid", "standard", "calm", "pastel"];
export const SHAPES: ShapeValue[] = ["soft", "standard", "crisp"];
export const DENSITIES: DensityValue[] = ["compact", "default", "comfortable"];
export const MOTIONS: MotionValue[] = ["bouncy", "standard", "calm", "none"];
export const ICON_FAMILIES: IconFamily[] = ["phosphor", "solar", "lucide"];
export const VOICES: VoiceValue[] = ["formal", "neutral", "casual"];

export const HUE_PRESETS: { name: string; value: number }[] = [
  { name: "ocean", value: 210 },
  { name: "forest", value: 145 },
  { name: "sunset", value: 25 },
  { name: "lavender", value: 280 },
  { name: "crimson", value: 355 },
  { name: "slate", value: 220 },
];
