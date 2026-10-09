// The intro video over the whole screen (ui/introPlayer plays it), with a Skip button in the
// bottom right while it plays. When it ends, or is skipped, the button goes and the video
// fades into the desk. Esc skips too.

import { type CSSProperties, type ReactElement, useCallback, useEffect } from "react";
import { Config } from "@shared/Config";
import { cx } from "@client/ui/classNames";
import { introVideoElement, skipIntro, useIntro } from "@client/ui/introPlayer";
import styles from "@client/ui/IntroVideo.module.css";

export function IntroVideo(): ReactElement | null {
  const intro = useIntro();
  const playing = intro === "playing";

  // The video element lives outside React (it starts playing inside the New Game click), so
  // it's moved in here while the intro shows.
  const attach = useCallback((frame: HTMLDivElement | null) => {
    const video = introVideoElement();
    if (frame !== null && video !== null) {
      frame.appendChild(video);
    }
  }, []);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        skipIntro();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playing]);

  if (intro === "off") {
    return null;
  }
  return (
    <div
      className={cx(styles.intro, intro === "fading" && styles.fading)}
      // A CSS variable, which CSSProperties doesn't list.
      style={{ "--intro-fade-seconds": `${Config.Intro.FadeSeconds}s` } as CSSProperties}
    >
      <div ref={attach} className={styles.frame} />
      {playing && (
        // The desk underneath can't take focus while this is up, so focus starts here.
        <button type="button" className={styles.skip} onClick={skipIntro} autoFocus>
          Skip ▸▸
        </button>
      )}
    </div>
  );
}
