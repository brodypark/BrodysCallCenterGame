// The ♪ button in the taskbar tray and its little menu: pick a song to loop (or none) and
// set how loud it plays. Closes when the player clicks anywhere else or presses Escape.

import { type ReactElement, useEffect, useRef, useState } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { setMusicSong, setMusicVolume, useMusicSettings } from "@client/ui/music";
import { Songs } from "@client/ui/songs";
import styles from "@client/ui/MusicPicker.module.css";

const Percent = 100;

export function MusicPicker(): ReactElement {
  const settings = useMusicSettings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choices = [{ id: null, title: "No music" }, ...Songs];
  return (
    // Clicks reach the taskbar, which closes the start menu.
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={cx(styles.toggle, open && controls.pressed)}
        aria-label="Music"
        aria-expanded={open}
        title="Music"
        onClick={() => setOpen(!open)}
      >
        {settings.songId === null ? "🔇" : "♪"}
      </button>
      {open && (
        <div className={cx(controls.raised, styles.menu)} role="dialog" aria-label="Music">
          <p className={styles.heading}>MUSIC</p>
          <div role="radiogroup" aria-label="Song" className={styles.songs}>
            {choices.map((song) => (
              <label key={song.id ?? "none"} className={styles.song}>
                <input
                  type="radio"
                  name="music-song"
                  checked={settings.songId === song.id}
                  onChange={() => setMusicSong(song.id)}
                />
                {song.title}
              </label>
            ))}
          </div>
          <label className={styles.volume}>
            Volume
            <input
              type="range"
              min={0}
              max={Percent}
              value={Math.round(settings.volume * Percent)}
              onChange={(event) => setMusicVolume(Number(event.target.value) / Percent)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
