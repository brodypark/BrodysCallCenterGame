import { describe, expect, it } from "vitest";
import { Config } from "@shared/Config";
import { DefaultMusic, musicVolume, parseMusicSettings } from "@client/ui/musicSettings";
import { Songs } from "@client/ui/songs";

describe("parseMusicSettings", () => {
  it("starts new players on the first song at the default volume", () => {
    expect(parseMusicSettings(null)).toEqual({
      songId: Songs[0]?.id,
      volume: Config.Music.DefaultVolume,
    });
  });

  it("reads saved settings, including music off", () => {
    const song = Songs.at(-1)?.id ?? null;
    expect(parseMusicSettings(JSON.stringify({ songId: song, volume: 0.8 }))).toEqual({
      songId: song,
      volume: 0.8,
    });
    expect(parseMusicSettings(JSON.stringify({ songId: null, volume: 0.2 }))).toEqual({
      songId: null,
      volume: 0.2,
    });
  });

  it("falls back to the first song if the saved one is gone", () => {
    expect(parseMusicSettings(JSON.stringify({ songId: "removed", volume: 0.5 }))).toEqual({
      songId: DefaultMusic.songId,
      volume: 0.5,
    });
  });

  it("ignores broken or out-of-range saves", () => {
    expect(parseMusicSettings("{not json")).toEqual(DefaultMusic);
    expect(parseMusicSettings(JSON.stringify({ songId: null, volume: 7 }))).toEqual(DefaultMusic);
    expect(parseMusicSettings(JSON.stringify("hi"))).toEqual(DefaultMusic);
  });
});

describe("musicVolume", () => {
  it("drops while the victim talks", () => {
    const settings = { songId: null, volume: 0.8 };
    expect(musicVolume(settings, false)).toBe(0.8);
    expect(musicVolume(settings, true)).toBeCloseTo(0.8 * Config.Music.DuckLevel);
  });
});
