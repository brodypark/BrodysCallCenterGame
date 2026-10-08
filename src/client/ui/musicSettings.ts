// The player's music choice, kept in this browser (it's a preference, not game state): which
// song loops, or none, and how loud. Plain functions, so they're tested without a browser.

import { z } from "zod";
import { Config } from "@shared/Config";
import { findSong, Songs } from "@client/ui/songs";

export interface MusicSettings {
  // null means music off.
  songId: string | null;
  // From 0 to 1.
  volume: number;
}

export const DefaultMusic: MusicSettings = {
  songId: Songs[0]?.id ?? null,
  volume: Config.Music.DefaultVolume,
};

const savedSchema = z.object({
  songId: z.string().nullable(),
  volume: z.number().min(0).max(1),
});

/** The settings saved as `saved` (JSON), or the defaults if there are none or they're
 * broken. A song that no longer exists falls back to the first one. */
export function parseMusicSettings(saved: string | null): MusicSettings {
  if (saved === null) {
    return DefaultMusic;
  }
  try {
    const parsed = savedSchema.safeParse(JSON.parse(saved));
    if (!parsed.success) {
      return DefaultMusic;
    }
    const { songId, volume } = parsed.data;
    const song = songId === null ? null : (findSong(songId)?.id ?? DefaultMusic.songId);
    return { songId: song, volume };
  } catch {
    return DefaultMusic;
  }
}

/** How loud the music plays: quieter while the victim is talking, so they're clear. */
export function musicVolume(settings: MusicSettings, victimTalking: boolean): number {
  return settings.volume * (victimTalking ? Config.Music.DuckLevel : 1);
}
