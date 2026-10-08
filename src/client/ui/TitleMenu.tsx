// The title menu: the game's home screen between shifts, over the whole desktop. Clock In
// starts a shift (the click also unlocks browser audio for the victims' voices); Go to Desk
// hides it to use the Shop and Stats (the taskbar's Main Menu button brings it back). Some
// buttons are placeholders for later. While no save is picked, only the art and title show,
// behind the save picker.

import { type CSSProperties, type ReactElement, useEffect, useState } from "react";
import { GameInfo } from "@shared/gameInfo";
import { useConnection } from "@client/state/connectionStore";
import { cx } from "@client/ui/classNames";
import { useDesktop } from "@client/ui/DesktopContext";
import { TitleBackground } from "@client/ui/TitleBackground";
import { useTitleMenuShown } from "@client/ui/useTitleMenuShown";
import { SettingsContent } from "@client/ui/apps/Settings";
import styles from "@client/ui/TitleMenu.module.css";
import { enterSandbox } from "@client/net/sandboxActions";

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
  const online = useConnection().status === "connected";
  // Counts "Coming soon!" clicks; a new value restarts the toast. Null when it's hidden.
  const [toastKey, setToastKey] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [showPatchNotes, setShowPatchNotes] = useState(false);
  const [showCustomCallers, setShowCustomCallers] = useState(false);

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

  const mainMenu: readonly { label: string; onClick: () => void; needsServer?: boolean }[] = [
    { label: "Settings", onClick: () => setShowSettings(true) },
    { label: "How to Play", onClick: () => setShowHowToPlay(true) },
    { label: "Custom Callers", onClick: () => setShowCustomCallers(true) },
  ];

  const sideMenu: readonly { label: string; onClick: () => void; needsServer?: boolean }[] = [
    { label: "Patch Notes", onClick: () => setShowPatchNotes(true) },
    { label: "Credits", onClick: () => setShowCredits(true) },
    { label: "Discord", onClick: () => window.open("https://discord.gg/mfQzGC2pGX", "_blank") },
    {
      label: "GitHub",
      onClick: () => window.open("https://github.com/brodypark/BrodysCallCenterGame", "_blank"),
    },
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

        {!online && <p className={styles.terms}>Connecting to the office...</p>}
        {online && (
          <>
            <div className={styles.playGroup}>
              <button
                type="button"
                className={cx(styles.button, styles.clockIn)}
                style={entrance(0)}
                disabled={!online}
                autoFocus
                onClick={() => store.setSavePickerOpen(true)}
              >
                Campaign
              </button>
              <button
                type="button"
                className={cx(styles.button, styles.clockIn)}
                style={entrance(1)}
                disabled={!online}
                onClick={enterSandbox}
              >
                Sandbox
              </button>
            </div>
            <div className={styles.grid}>
              {mainMenu.map((item, index) => (
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

            <button
              type="button"
              className={cx(styles.button, styles.donateButton)}
              style={entrance(mainMenu.length + 2)}
              onClick={() => setShowDonate(true)}
            >
              Donate 🙏
            </button>

            <div className={styles.sideMenu}>
              {sideMenu.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  className={styles.sideButton}
                  style={entrance(mainMenu.length + 3 + index)}
                  disabled={item.needsServer === true && !online}
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {showSettings && (
              <div className={styles.settingsModal}>
                <div className={styles.settingsModalContent}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowSettings(false)}
                  >
                    X
                  </button>
                  <SettingsContent />
                </div>
              </div>
            )}

            {showDonate && (
              <div className={styles.settingsModal}>
                <div className={styles.settingsModalContent}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowDonate(false)}
                  >
                    X
                  </button>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "22px",
                      padding: "30px 10px 10px 10px",
                    }}
                  >
                    <p>
                      This game costs tokens from ElevenLabs and Gemini, so any donations would be
                      appreciated, reach out to me if you know me or in my discord.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {showHowToPlay && (
              <div className={styles.settingsModal}>
                <div className={cx(styles.settingsModalContent, styles.howToPlayContent)}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowHowToPlay(false)}
                  >
                    X
                  </button>
                  <h2 style={{ marginTop: 0 }}>How to Play</h2>
                  <div style={{ fontSize: "18px", lineHeight: "1.4" }}>
                    <p>
                      <b>1. Clock In:</b> Start your shift. You must meet your quota before time
                      runs out or you're fired!
                    </p>
                    <p>
                      <b>2. Take Calls:</b> Use the Phone app to answer calls. Sweet-talk victims
                      without raising their Suspicion.
                    </p>
                    <p>
                      <b>3. Get Codes:</b> Once they trust you, they'll read you a Gift Card code or
                      Wobblebucks card.
                    </p>
                    <p>
                      <b>4. Redeem:</b> Type the codes into the Redeem app or Wobblebucks machine to
                      get paid.
                    </p>
                    <p>
                      <b>5. Upgrades:</b> Use the Shop between shifts to buy perks. Hold <b>V</b> to
                      use your microphone!
                    </p>
                  </div>
                </div>
              </div>
            )}

            {showCredits && (
              <div className={styles.settingsModal}>
                <div className={cx(styles.settingsModalContent, styles.howToPlayContent)}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowCredits(false)}
                  >
                    X
                  </button>
                  <h2 style={{ marginTop: 0 }}>Credits</h2>
                  <div style={{ fontSize: "18px", lineHeight: "1.4" }}>
                    <p>
                      <b>Created by:</b> Brody Park
                    </p>
                    <p>
                      <b>Discord:</b> hubble0
                    </p>
                    <p>
                      <b>Inspiration:</b> Inspired by the new game,{" "}
                      <a
                        href="https://store.steampowered.com/app/4954910/Scam_With_Your_Friends/"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--ribbon)", fontWeight: "bold" }}
                      >
                        Scam With Your Friends
                      </a>
                      .
                    </p>
                    <p>
                      <b>Voice Generation:</b> Powered by ElevenLabs AI
                    </p>
                    <p>
                      <b>Dialogue Generation:</b> Powered by Google Gemini AI
                    </p>
                  </div>
                </div>
              </div>
            )}

            {showPatchNotes && (
              <div className={styles.settingsModal}>
                <div
                  className={cx(styles.settingsModalContent, styles.howToPlayContent)}
                  style={{ maxHeight: "80vh", overflowY: "auto" }}
                >
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowPatchNotes(false)}
                  >
                    X
                  </button>
                  <h2 style={{ marginTop: 0 }}>Patch Notes</h2>
                  <div style={{ fontSize: "16px", lineHeight: "1.4" }}>
                    <h3 style={{ color: "var(--ribbon)", marginBottom: "4px" }}>
                      v1.0.0 - The Call Center Opens!
                    </h3>
                    <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
                      <li>
                        <b>Initial Release!</b> Welcome to your first shift at the call center.
                      </li>
                      <li>Added fully voice-acted callers using ElevenLabs AI.</li>
                      <li>Integrated Google Gemini for dynamic, unscripted caller dialogue.</li>
                      <li>Added Campaign mode with daily quotas and unlockable perks.</li>
                      <li>Added the Wobblebucks machine for extra side-hustle profits.</li>
                      <li>Included new desktop customization themes.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {showCustomCallers && (
              <div className={styles.settingsModal}>
                <div className={cx(styles.settingsModalContent, styles.howToPlayContent)}>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={() => setShowCustomCallers(false)}
                  >
                    X
                  </button>
                  <h2 style={{ marginTop: 0 }}>Custom Callers</h2>
                  <div style={{ fontSize: "18px", lineHeight: "1.4", paddingBottom: "20px" }}>
                    <p>
                      You can request <b>Custom Callers</b> with their own unique voice,
                      personality, backstory, and dialogue style!
                    </p>
                    <p>
                      Join the Discord and let us know what kind of victim you want to scam next:
                    </p>
                    <div style={{ textAlign: "center", marginTop: "15px" }}>
                      <a
                        href="https://discord.gg/mfQzGC2pGX"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--ribbon)", fontWeight: "bold", fontSize: "20px" }}
                      >
                        Join the Discord
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

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
