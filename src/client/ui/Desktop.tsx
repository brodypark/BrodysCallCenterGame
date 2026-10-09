// The whole computer screen: wallpaper, desktop icons, the desktop pet, app windows, taskbar,
// start menu, new-mail notifications, the title menu between shifts, and the hacked screen.
// It renders inside whatever element it's given (the full page today, a monitor in a shared
// office later): a 16:9 screen sized to that element, never to the browser window, with
// black bars around it. Everything inside scales with the screen.

import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { AppList } from "@client/ui/appList";
import { useConnection } from "@client/state/connectionStore";
import { useSaves } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { clockIn } from "@client/net/shiftActions";
import { formatClock } from "@shared/time";
import { DesktopContext, type DesktopContextValue } from "@client/ui/DesktopContext";
import { DesktopIcons } from "@client/ui/DesktopIcons";
import { DesktopPet } from "@client/ui/DesktopPet";
import { HackOverlay } from "@client/ui/HackOverlay";
import { IntroVideo } from "@client/ui/IntroVideo";
import { useIntroShown } from "@client/ui/introPlayer";
import { createDesktopStore } from "@client/ui/desktopStore";
import { DesktopIconGrid, DesktopLayout, layoutVars } from "@client/ui/layout";
import { SavePicker } from "@client/ui/SavePicker";
import { SessionOverlay } from "@client/ui/SessionOverlay";
import { ShiftResults } from "@client/ui/ShiftResults";
import { StartMenu } from "@client/ui/StartMenu";
import { Taskbar } from "@client/ui/Taskbar";
import { Toasts } from "@client/ui/Toasts";
import { TitleMenu } from "@client/ui/TitleMenu";
import { useStats } from "@client/state/statsStore";
import { useHack } from "@client/state/hackStore";
import { useDesktopShake } from "@client/ui/desktopShake";
import { useCallPopups } from "@client/ui/useCallPopups";
import { useDesktopSounds } from "@client/ui/useDesktopSounds";
import { useTitleMenuReset, useTitleMenuShown } from "@client/ui/useTitleMenuShown";
import { useTutorialPopup } from "@client/ui/useTutorialPopup";
import { useMailPopup } from "@client/ui/useMailPopup";
import { keepAudioUnlocked, unlockAudio } from "@client/voice/audioUnlock";
import { Windows } from "@client/ui/Windows";
import { SuspicionAlert } from "@client/ui/SuspicionAlert";
import styles from "@client/ui/Desktop.module.css";
import "@client/ui/fonts.css";
import "@client/ui/themes/themes.css";

export function Desktop(): ReactElement {
  const [store] = useState(() =>
    createDesktopStore(AppList, DesktopIconGrid, DesktopLayout.TaskbarHeight),
  );
  const screenRef = useRef<HTMLDivElement>(null);
  const desktop = useMemo<DesktopContextValue>(() => ({ store, screenRef }), [store]);
  // What shakes when a victim hangs up: everything on the screen, inside its box.
  const layersRef = useRef<HTMLDivElement>(null);
  useDesktopShake(layersRef);
  useDesktopSounds(store, screenRef);
  useCallPopups(store);
  useTitleMenuReset(store);
  useTutorialPopup(store);
  // After How to Play, so the welcome email opens in front of it.
  useMailPopup(store);
  // The title menu and the intro video cover the desk; keyboard focus mustn't reach what's
  // under them.
  const menuShown = useTitleMenuShown(store);
  const introShown = useIntroShown();
  // The hacked screen freezes everything under it, the shift report included.
  const hacked = useHack() !== null;
  // Also after a refresh mid-shift, when there's no Clock In click to do it.
  useEffect(() => keepAudioUnlocked(), []);
  // While another tab has the game, nothing here can be clicked, typed in or focused.
  const replaced = useConnection().status === "replaced";
  // The save's equipped cosmetics (the defaults until a save is picked).
  const { theme, wallpaper } = useStats();

  const saves = useSaves();
  const activeSlot = saves?.activeSlot ?? null;
  // Sandbox has no shifts, so no Clock In; its control panel opens by itself instead.
  const sandbox = saves?.mode === "sandbox";
  useEffect(() => {
    if (sandbox) {
      store.openApp("ControlPanel");
    }
  }, [sandbox, store]);
  const { snapshot: shift } = useShift();

  return (
    <DesktopContext value={desktop}>
      <div className={styles.host}>
        <div
          ref={screenRef}
          className={styles.screen}
          style={layoutVars}
          data-desktop-screen=""
          data-theme={theme}
          data-wallpaper={wallpaper}
        >
          <div ref={layersRef} className={styles.layers} inert={replaced}>
            <div className={styles.desk} inert={menuShown || introShown || hacked}>
              {/* Clicking the bare wallpaper closes the start menu. */}
              <div className={styles.wallpaper} onClick={() => store.setStartMenuOpen(false)} />

              {/* Floating Clock In button */}
              {activeSlot !== null && !sandbox && shift.status === "offShift" && !menuShown && (
                <div className={styles.clockInWrapper}>
                  <button
                    type="button"
                    className={styles.clockInButton}
                    onClick={() => {
                      unlockAudio();
                      clockIn();
                    }}
                  >
                    Clock In
                  </button>
                  <p className={styles.clockInTerms}>
                    Earn <b>${shift.quota}</b> in <b>{formatClock(shift.lengthSeconds)}</b>
                  </p>
                </div>
              )}

              <DesktopIcons />
              <Windows />
              {/* After the windows, so the pet walks in front of them. */}
              <DesktopPet />
              <Taskbar />
              <StartMenu />
              <Toasts />
            </div>
            {/* Under the intro until the new save has loaded, and if it never does. */}
            <div className={styles.menus} inert={introShown || hacked}>
              <TitleMenu />
              <ShiftResults />
              <SavePicker />
            </div>
            <IntroVideo />
            <HackOverlay />
          </div>
          <SuspicionAlert />
          <SessionOverlay />
        </div>
      </div>
    </DesktopContext>
  );
}
