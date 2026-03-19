/* TRINITY THEME — Edit this file to change all visual styling.
   FONTS: Change FONT_TITLE after adding @font-face in src/fonts.css */

export const FONT_TITLE = "'Cloister Black', serif";
export const FONT_UI = "'Matrix Small Caps', serif";
export const FONT_BODY = "'EB Garamond', Georgia, serif";
export const FONT_URL =
  "https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Cinzel:wght@400;600;700;800;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap";

export const THEME = {
  bg: "#04040a", bg2: "#08080e",
  panel: "#0a0a10", panelBorder: "#18181f",
  card: "#0c0c12", cardBorder: "#1e1e28",
  silver: "#a8a8b8", silverBright: "#d0d0dc", silverDim: "#555564", white: "#e4e4ec",
  being: "#607080", field: "#6a6050", equip: "#605868", bless: "#607888", curse: "#884455",
  text: "#b8b8c8", textDim: "#505060", textBright: "#d8d8e4",
  light: "#c0c0d0", dark: "#6a4898", balanced: "#508080",
  danger: "#993344", legendary: "#d8c8a0", black: "#000000",
  gridCell: "#06060a", gridCellHL: "#1a1a24",
  parchment: "#b8a888", wood2: "#3a2a1c",
};

export const TYPE_COLORS = {
  being: THEME.being,
  field: THEME.field,
  equip: THEME.equip,
  bless: THEME.bless,
  curse: THEME.curse,
};

export const DEFAULT_GRADS = {
  being: ["#4a3c2c", "#2a1c10"],
  field: ["#3a3828", "#1c1a10"],
  equip: ["#3c3430", "#1e1a18"],
  bless: ["#1972d7ff", "#1c2838"],
  curse: ["#4a2028", "#2a0c14"],
};

export const RARITY_ORDER = [
  "common",
  "uncommon",
  "rare",
  "legendary"
];

export const RARITY_COLORS = {
  common: THEME.textDim,
  uncommon: THEME.silver,
  rare: THEME.silverBright,
  legendary: THEME.legendary,
};

// being / field stats
export const STAT_DEFS = [
  { key: "soul", label: "S", color: "#a88870" }, // soul
  { key: "mind", label: "M", color: "#7088a8" }, // mind
  { key: "will", label: "W", color: "#70a890" }, // will
];

// feature flags
export const TRIBUTE_SUMMON_ENABLED = false;

// game config
export const STAT_MIN = -4;
export const STAT_MAX = 4;
export const C_MAX = 10;
export const DECK_SIZE = 30;
export const HAND_SIZE = 7;
export const MAX_COPIES = 3;

export const TOKENS_START = 2;
export const TOKENS_PER_WIN = 1;
export const PACK_COST = 1;
export const CARDS_PER_PACK = 4;
