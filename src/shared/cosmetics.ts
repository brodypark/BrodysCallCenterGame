// The wallpapers and window themes the desktop can wear, the phone's ringtones and the
// desktop pets. Every wallpaper and theme id needs a rule in the client's themes.css, or the
// desktop draws without its colors; every ringtone needs a sound in the client's soundList,
// and every pet (but noPet) a sprite and behavior in the client's petSprites and Config.Pets.

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

export const PetIds = ["noPet", "petRock", "pixelCat", "deskBuddy"] as const;
export type PetId = (typeof PetIds)[number];
// The pets that show up on the desktop.
export type VisiblePetId = Exclude<PetId, "noPet">;

// What a new save starts with. Owned without being bought.
export const DefaultWallpaper = "teal" satisfies WallpaperId;
export const DefaultTheme = "classic" satisfies ThemeId;
export const DefaultRingtone = "classicBell" satisfies RingtoneId;
export const DefaultPet = "noPet" satisfies PetId;

// The ones the shop sells (everything but the defaults); each needs a Config price.
export type BuyableCosmeticId =
  | Exclude<WallpaperId, typeof DefaultWallpaper>
  | Exclude<ThemeId, typeof DefaultTheme>
  | Exclude<RingtoneId, typeof DefaultRingtone>
  | Exclude<PetId, typeof DefaultPet>;
