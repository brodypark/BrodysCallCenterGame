// The wallpapers and window themes the desktop can wear. Every id needs a rule in the
// client's themes.css, or the desktop draws without its colors.

export const WallpaperIds = [
  "teal",
  "midnightBlue",
  "sunsetGradient",
  "hackerGrid",
  "puddingPink",
] as const;
export type WallpaperId = (typeof WallpaperIds)[number];

export const ThemeIds = ["classic", "darkMode", "bubblegum", "terminalGreen"] as const;
export type ThemeId = (typeof ThemeIds)[number];

// What a new save starts with. Owned without being bought.
export const DefaultWallpaper = "teal" satisfies WallpaperId;
export const DefaultTheme = "classic" satisfies ThemeId;

// The ones the shop sells (everything but the defaults); each needs a Config price.
export type BuyableCosmeticId =
  Exclude<WallpaperId, typeof DefaultWallpaper> | Exclude<ThemeId, typeof DefaultTheme>;
