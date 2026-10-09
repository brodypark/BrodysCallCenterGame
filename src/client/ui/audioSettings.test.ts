import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import {
  type AudioSettings,
  DefaultAudio,
  effectsVolume,
  musicVolume,
  parseAudioSettings,
  videoVolume,
  voiceVolume,
} from "@client/ui/audioSettings";
import { Songs } from "@client/ui/songs";

describe("parseAudioSettings", () => {
  it("starts new players on the first song with effects on", () => {
    expect(parseAudioSettings(null)).toEqual({
      masterVolume: Config.Sounds.DefaultMasterVolume,
      songId: Songs[0]?.id,
      musicVolume: Config.Music.DefaultVolume,
      effectsOn: true,
      effectsVolume: Config.Sounds.DefaultEffectsVolume,
    });
  });

  it("reads saved settings, including music and effects off", () => {
    const saved: AudioSettings = {
      masterVolume: 0.5,
      songId: null,
      musicVolume: 0.2,
      effectsOn: false,
      effectsVolume: 0.9,
    };
    expect(parseAudioSettings(JSON.stringify(saved))).toEqual(saved);
  });

  it("carries over saves from before effects had settings", () => {
    const song = Songs.at(-1)?.id ?? null;
    expect(parseAudioSettings(JSON.stringify({ songId: song, volume: 0.8 }))).toEqual({
      ...DefaultAudio,
      songId: song,
      musicVolume: 0.8,
    });
  });

  it("falls back to the first song if the saved one is gone", () => {
    expect(parseAudioSettings(JSON.stringify({ songId: "removed" })).songId).toBe(
      DefaultAudio.songId,
    );
  });

  it("ignores broken or out-of-range saves", () => {
    expect(parseAudioSettings("{not json")).toEqual(DefaultAudio);
    expect(parseAudioSettings(JSON.stringify({ musicVolume: 7 }))).toEqual(DefaultAudio);
    expect(parseAudioSettings(JSON.stringify("hi"))).toEqual(DefaultAudio);
  });
});

describe("volumes", () => {
  const settings: AudioSettings = {
    masterVolume: 0.5,
    songId: null,
    musicVolume: 0.8,
    effectsOn: true,
    effectsVolume: 0.6,
  };

  it("scales everything by the master volume", () => {
    expect(musicVolume(settings, false)).toBeCloseTo(0.4);
    expect(effectsVolume(settings)).toBeCloseTo(0.3);
    expect(voiceVolume(settings)).toBe(0.5);
    expect(videoVolume(settings)).toBe(0.5);
  });

  it("drops the music while the victim talks", () => {
    expect(musicVolume(settings, true)).toBeCloseTo(0.4 * Config.Music.DuckLevel);
  });

  it("silences effects when they're off", () => {
    expect(effectsVolume({ ...settings, effectsOn: false })).toBe(0);
  });
});
