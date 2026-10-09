// Settings app (also shown from the title menu): full screen, the master volume over
// everything, the background music (which song, or none, and how loud), and sound effects
// (on or off, and how loud). The sound settings are saved in this browser.

import { type KeyboardEvent, type ReactElement, useId } from "react";
import {
  setEffectsOn,
  setEffectsVolume,
  setMasterVolume,
  setMusicSong,
  setMusicVolume,
  useAudioSettings,
} from "@client/ui/audioSettingsStore";
import type { AppProps } from "@client/ui/apps/index";
import { cx } from "@client/ui/classNames";
import { fullscreenSupported, setFullscreen, useFullscreen } from "@client/ui/fullscreen";
import { playSound } from "@client/ui/sounds";
import { Songs } from "@client/ui/songs";
import appStyles from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Settings.module.css";

const Percent = 100;

// Keys that move a slider, so letting go of one (not Tab arriving on it) previews it.
const SliderKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

/** A 0-100% slider for a 0-1 volume. `onDone` runs when the player lets go of it. */
function VolumeSlider({
  label,
  value,
  onChange,
  onDone,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onDone?: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <label className={styles.volume}>
      {label}
      <input
        type="range"
        min={0}
        max={Percent}
        value={Math.round(value * Percent)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / Percent)}
        onPointerUp={onDone}
        onKeyUp={(event: KeyboardEvent<HTMLInputElement>) => {
          if (SliderKeys.has(event.key)) {
            onDone?.();
          }
        }}
      />
      <span className={styles.percent}>{Math.round(value * Percent)}%</span>
    </label>
  );
}

// A sample of the sound effects at their new volume.
function previewEffects(): void {
  playSound("message-sent");
}

export function SettingsContent(): ReactElement {
  const settings = useAudioSettings();
  const choices = [{ id: null, title: "No music" }, ...Songs];
  // Unique per copy: the Settings window and the title menu's can both be open.
  const songGroup = useId();
  const fullscreen = useFullscreen();

  return (
    <div className={styles.root}>
      {fullscreenSupported() && (
        <div className={styles.section}>
          <div className={styles.heading}>DISPLAY</div>
          <label className={styles.song}>
            <input
              type="checkbox"
              checked={fullscreen}
              onChange={(event) => void setFullscreen(event.target.checked)}
            />
            Full screen
          </label>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.heading}>MASTER VOLUME</div>
        <VolumeSlider
          label="Volume"
          value={settings.masterVolume}
          onChange={setMasterVolume}
          onDone={previewEffects}
        />
      </div>

      <div className={styles.section}>
        <div className={styles.heading}>MUSIC</div>
        <div role="radiogroup" aria-label="Song" className={styles.songs}>
          {choices.map((song) => (
            <label key={song.id ?? "none"} className={styles.song}>
              <input
                type="radio"
                name={songGroup}
                checked={settings.songId === song.id}
                onChange={() => setMusicSong(song.id)}
              />
              {song.title}
            </label>
          ))}
        </div>
        <VolumeSlider label="Volume" value={settings.musicVolume} onChange={setMusicVolume} />
      </div>

      <div className={styles.section}>
        <div className={styles.heading}>SOUND EFFECTS</div>
        <label className={styles.song}>
          <input
            type="checkbox"
            checked={settings.effectsOn}
            onChange={(event) => setEffectsOn(event.target.checked)}
          />
          Play sound effects
        </label>
        <VolumeSlider
          label="Volume"
          value={settings.effectsVolume}
          onChange={setEffectsVolume}
          onDone={previewEffects}
          disabled={!settings.effectsOn}
        />
      </div>
    </div>
  );
}

export function Settings({ close: _close }: AppProps): ReactElement {
  return (
    <div className={cx(appStyles.windowContent)}>
      <SettingsContent />
    </div>
  );
}
