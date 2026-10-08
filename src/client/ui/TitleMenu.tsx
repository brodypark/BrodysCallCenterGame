// The title menu: the game's home screen between shifts, over the whole desktop. Clock In
// starts a shift (the click also unlocks browser audio for the victims' voices); Go to Desk
// hides it to use the Shop and Stats (the taskbar's Main Menu button brings it back). Some
// buttons are placeholders for later. While no save is picked, only the art and title show,
// behind the save picker.

import { type CSSProperties, type ReactElement, useEffect, useState } from "react";
import { GameInfo } from "@shared/gameInfo";
import { levelOf } from "@shared/Levels";
import { formatClock } from "@shared/time";
import { leaveSave } from "@client/net/saveActions";
import { clockIn } from "@client/net/shiftActions";
import { useConnection } from "@client/state/connectionStore";
import { useSaves } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { useStats } from "@client/state/statsStore";
import type { AppId } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import { useDesktop } from "@client/ui/DesktopContext";
import { TitleBackground } from "@client/ui/TitleBackground";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";
import { unlockAudio } from "@client/voice/audioUnlock";
import styles from "@client/ui/TitleMenu.module.css";

// Bulbs around the title sign: how many along each long and short side.
const BulbsAcross = 13;
const BulbsDown = 4;
// How long "Coming soon!" stays up.
const ToastMs = 1800;

/** Positions (in % of the sign) of the bulbs around its edge, clockwise from top left. */
function bulbPositions(): readonly { left: number; top: number }[] {
  const bulbs: { left: number; top: number }[] = [];
  for (let i = 0; i < BulbsAcross; i++) {
    bulbs.push({ left: (i / BulbsAcross) * 100, top: 0 });
  }
  for (let i = 0; i < BulbsDown; i++) {
    bulbs.push({ left: 100, top: (i / BulbsDown) * 100 });
  }
  for (let i = 0; i < BulbsAcross; i++) {
    bulbs.push({ left: 100 - (i / BulbsAcross) * 100, top: 100 });
  }
  for (let i = 0; i < BulbsDown; i++) {
    bulbs.push({ left: 0, top: 100 - (i / BulbsDown) * 100 });
  }
  return bulbs;
}

const Bulbs = bulbPositions();

/** Its place in the buttons' staggered entrance. */
function entrance(order: number): CSSProperties {
  // A CSS variable, which CSSProperties doesn't list.
  return { "--i": order } as CSSProperties;
}

/** Text with a thick outline: an outlined copy drawn first, then the fill on top. */
function OutlinedText({
  text,
  fillClass,
}: {
  text: string;
  fillClass: string | undefined;
}): ReactElement {
  return (
    <span className={styles.outlined}>
      <span className={styles.outline} aria-hidden>
        {text}
      </span>
      <span className={cx(styles.fill, fillClass)}>{text}</span>
    </span>
  );
}

export function TitleMenu(): ReactElement | null {
  const { store } = useDesktop();
  const shown = useTitleMenuShown(store);
  const { snapshot } = useShift();
  const stats = useStats();
  const online = useConnection().status === "connected";
  const activeSlot = useSaves()?.activeSlot ?? null;
  // Counts "Coming soon!" clicks; a new value restarts the toast. Null when it's hidden.
  const [toastKey, setToastKey] = useState<number | null>(null);

  useEffect(() => {
    if (toastKey === null) {
      return;
    }
    const timer = setTimeout(() => setToastKey(null), ToastMs);
    return () => clearTimeout(timer);
  }, [toastKey]);

  if (!shown) {
    return null;
  }

  function comingSoon(): void {
    setToastKey((count) => (count ?? 0) + 1);
  }

  function goTo(app?: AppId): void {
    store.setTitleMenuOpen(false);
    if (app) {
      store.openApp(app);
    }
  }

  // Placeholders say "Coming soon!" for now. Discord has no link yet: the content rules
  // keep off-site links out until we decide on it.
  const menu: readonly { label: string; onClick: () => void; needsServer?: boolean }[] = [
    { label: "Go to Desk", onClick: () => goTo() },
    { label: "How to Play", onClick: () => goTo("Tutorial") },
    { label: "Shop", onClick: () => goTo("Shop") },
    { label: "Switch Save", onClick: leaveSave, needsServer: true },
    { label: "Settings", onClick: comingSoon },
    { label: "Patch Notes", onClick: comingSoon },
    { label: "Credits", onClick: comingSoon },
    { label: "Discord", onClick: comingSoon },
  ];

  return (
    <section className={styles.menu} aria-label="Title menu">
      <TitleBackground />
      <div className={styles.vignette} />

      <div className={styles.content}>
        <div className={styles.signWrap}>
          <div className={styles.sign}>
            {Bulbs.map((bulb, index) => (
              <span
                key={`${bulb.left},${bulb.top}`}
                className={cx(styles.bulb, index % 2 === 1 && styles.bulbAlt)}
                style={{ left: `${bulb.left}%`, top: `${bulb.top}%` }}
              />
            ))}
            <h1 className={styles.title}>
              <OutlinedText text="TRUST ME BRO" fillClass={styles.titleFill} />
            </h1>
          </div>
          <p className={styles.ribbon}>
            <OutlinedText text="TECH SUPPORT" fillClass={styles.ribbonFill} />
          </p>
        </div>

        {activeSlot === null && !online && (
          <p className={styles.terms}>Connecting to the office...</p>
        )}
        {activeSlot !== null && (
          <>
            <button
              type="button"
              className={cx(styles.button, styles.clockIn)}
              style={entrance(0)}
              disabled={!online}
              // Keyboard players start here; the desk underneath can't be reached.
              autoFocus
              onClick={() => {
                unlockAudio();
                clockIn();
              }}
            >
              Clock In
            </button>
            <p className={styles.terms} style={entrance(1)}>
              {online ? (
                <>
                  Earn <b>${snapshot.quota}</b> in <b>{formatClock(snapshot.lengthSeconds)}</b> to
                  get PROMOTED
                </>
              ) : (
                "Connecting to the office..."
              )}
            </p>
            <div className={styles.grid}>
              {menu.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  className={cx(styles.button, styles.secondary)}
                  style={entrance(index + 2)}
                  disabled={item.needsServer === true && !online}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {activeSlot !== null && (
        <p className={styles.badge}>
          Slot {activeSlot} <span className={styles.dot}>•</span> Level {levelOf(stats.xp)}{" "}
          <span className={styles.dot}>•</span> ${stats.money}
        </p>
      )}
      {/* Always mounted, so screen readers announce the text when it appears. */}
      <div className={styles.toastArea} role="status">
        {toastKey !== null && (
          <p key={toastKey} className={styles.toast}>
            Coming soon!
          </p>
        )}
      </div>
      <p className={cx(styles.corner, styles.left)}>Made by {GameInfo.Author}</p>
      <p className={cx(styles.corner, styles.right)}>v{GameInfo.Version}</p>
    </section>
  );
}
