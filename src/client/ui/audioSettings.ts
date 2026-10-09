// The player's sound settings, kept in this browser (preferences, not game state): a master
// volume over everything, which song loops (or none) and how loud, and whether sound effects
// play and how loud. Plain functions, so they're tested without a browser.

import { z } from "zod";
import { Config } from "@shared/Config";
import { findSong, Songs } from "@client/ui/songs";

export interface AudioSettings {
  // Everything (music, sound effects, the victim's voice) is scaled by this, 0 to 1.
  masterVolume: number;
  // null means music off.
  songId: string | null;
  musicVolume: number;
  effectsOn: boolean;
  effectsVolume: number;
}

export const DefaultAudio: AudioSettings = {
  masterVolume: Config.Sounds.DefaultMasterVolume,
  songId: Songs[0]?.id ?? null,
  musicVolume: Config.Music.DefaultVolume,
  effectsOn: true,
  effectsVolume: Config.Sounds.DefaultEffectsVolume,
};

const volume = z.number().min(0).max(1);

// Saves from before sound effects had settings stored the music volume as `volume`.
const savedSchema = z.object({
  masterVolume: volume.optional(),
  songId: z.string().nullable().optional(),
  musicVolume: volume.optional(),
  volume: volume.optional(),
  effectsOn: z.boolean().optional(),
  effectsVolume: volume.optional(),
});

/** The settings saved as `saved` (JSON), or the defaults if there are none or they're
 * broken. Anything missing gets its default, and a song that no longer exists falls back to
 * the first one. */
export function parseAudioSettings(saved: string | null): AudioSettings {
  if (saved === null) {
    return DefaultAudio;
  }
  try {
    const parsed = savedSchema.safeParse(JSON.parse(saved));
    if (!parsed.success) {
      return DefaultAudio;
    }
    const data = parsed.data;
    const songId =
      data.songId === undefined
        ? DefaultAudio.songId
        : data.songId === null
          ? null
          : (findSong(data.songId)?.id ?? DefaultAudio.songId);
    return {
      masterVolume: data.masterVolume ?? DefaultAudio.masterVolume,
      songId,
      musicVolume: data.musicVolume ?? data.volume ?? DefaultAudio.musicVolume,
      effectsOn: data.effectsOn ?? DefaultAudio.effectsOn,
      effectsVolume: data.effectsVolume ?? DefaultAudio.effectsVolume,
    };
  } catch {
    return DefaultAudio;
  }
}

/** How loud the music plays: quieter while the victim is talking, so they're clear. */
export function musicVolume(settings: AudioSettings, victimTalking: boolean): number {
  return (
    settings.masterVolume * settings.musicVolume * (victimTalking ? Config.Music.DuckLevel : 1)
  );
}

/** How loud sound effects play (before each sound's own volume): 0 when they're off. */
export function effectsVolume(settings: AudioSettings): number {
  return settings.effectsOn ? settings.masterVolume * settings.effectsVolume : 0;
}

/** How loud the victim's voice plays (the call's mute button aside). */
export function voiceVolume(settings: AudioSettings): number {
  return settings.masterVolume;
}

/** How loud the intro video plays. */
export function videoVolume(settings: AudioSettings): number {
  return settings.masterVolume;
}
