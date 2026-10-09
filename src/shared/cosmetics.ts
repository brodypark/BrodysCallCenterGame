// The wallpapers and window themes the desktop can wear, and the phone's ringtones. Every
// wallpaper and theme id needs a rule in the client's themes.css, or the desktop draws
// without its colors; every ringtone needs a sound in the client's soundList.

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

export const RingtoneIds = ["classicBell", "airhorn", "chiptune", "dialUp", "yoPhone"] as const;
export type RingtoneId = (typeof RingtoneIds)[number];

// What a new save starts with. Owned without being bought.
export const DefaultWallpaper = "teal" satisfies WallpaperId;
export const DefaultTheme = "classic" satisfies ThemeId;
export const DefaultRingtone = "classicBell" satisfies RingtoneId;

// The ones the shop sells (everything but the defaults); each needs a Config price.
export type BuyableCosmeticId =
  | Exclude<WallpaperId, typeof DefaultWallpaper>
  | Exclude<ThemeId, typeof DefaultTheme>
  | Exclude<RingtoneId, typeof DefaultRingtone>;
