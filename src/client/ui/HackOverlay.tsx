// The hacked screen, when the player cashes in a bait caller's trap code: the desk freezes
// under a glitching overlay with a fake console typing out what the "hacker" is doing, then
// a countdown until it lets go. While it's up nothing on the desk can be clicked or typed in
// (Desktop makes the desk inert). Purely for show: the server has already failed the shift
// (or, in Sandbox, ended the call).

import { type ReactElement, useEffect } from "react";
import { Config } from "@shared/Config";
import { MsPerSecond, secondsToMs } from "@shared/time";
import { type HackState, hackSecondsLeft, useHack } from "@client/state/hackStore";
import { playSound } from "@client/ui/sounds";
import { useNow } from "@client/ui/useNow";
import styles from "@client/ui/HackOverlay.module.css";

/** What the fake console types out, one line at a time. */
function consoleLines(hack: HackState): string[] {
  const ending = hack.shiftFailed
    ? [`> Fine issued: -$${hack.fine} from your bank`, "> Shift terminated. Nice try, scammer!"]
    : ["> Fine issued: $0 (Sandbox, lucky you)", "> Call terminated. Nice try, scammer!"];
  return [
    "> INCOMING CONNECTION... from the caller you just scammed",
    "> Caller was an undercover scam-buster. Oops.",
    "> Uploading 4,000 photos of ducks to your desktop...",
    "> Replacing your hold music with a kazoo solo...",
    ...ending,
  ];
}

export function HackOverlay(): ReactElement | null {
  const hack = useHack();
  // A new hack starts the screen over. Only mounted while hacked, so its clock isn't ticking
  // the rest of the time.
  return hack && <HackScreen key={hack.startedAt} hack={hack} />;
}

function HackScreen({ hack }: { hack: HackState }): ReactElement {
  const now = useNow(secondsToMs(Config.Effects.HackTickSeconds));
  useEffect(() => playSound("hacked"), []);

  const lines = consoleLines(hack);
  const elapsedSeconds = (now - hack.startedAt) / MsPerSecond;
  const shown = Math.min(
    lines.length,
    1 + Math.floor((elapsedSeconds / Config.Effects.HackConsoleSeconds) * lines.length),
  );

  return (
    <div className={styles.overlay} role="alertdialog" aria-labelledby="hack-title">
      <div className={styles.stripes} aria-hidden="true" />
      <div className={styles.panel}>
        <p id="hack-title" className={styles.title}>
          YOU&apos;VE BEEN BAITED
        </p>
        <pre className={styles.console} aria-live="polite">
          {lines.slice(0, shown).join("\n")}
          <span className={styles.cursor}>█</span>
        </pre>
        <p className={styles.countdown}>System unfreezes in {hackSecondsLeft(hack, now)}...</p>
      </div>
    </div>
  );
}
