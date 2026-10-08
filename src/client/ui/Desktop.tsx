// The whole computer screen: wallpaper, desktop icons, app windows, taskbar and start menu.
// It renders inside whatever element it's given (the full page today, a monitor in a shared
// office later): a 16:9 screen sized to that element, never to the browser window, with
// black bars around it. Everything inside scales with the screen.

import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { AppList } from "@client/ui/appList";
import { useConnection } from "@client/state/connectionStore";
import { ClockIn } from "@client/ui/ClockIn";
import { DesktopContext, type DesktopContextValue } from "@client/ui/DesktopContext";
import { DesktopIcons } from "@client/ui/DesktopIcons";
import { createDesktopStore } from "@client/ui/desktopStore";
import { DesktopIconGrid, DesktopLayout, layoutVars } from "@client/ui/layout";
import { SavePicker } from "@client/ui/SavePicker";
import { SessionOverlay } from "@client/ui/SessionOverlay";
import { ShiftResults } from "@client/ui/ShiftResults";
import { StartMenu } from "@client/ui/StartMenu";
import { Taskbar } from "@client/ui/Taskbar";
import { useStats } from "@client/state/statsStore";
import { useCallPopups } from "@client/ui/useCallPopups";
import { useTutorialPopup } from "@client/ui/useTutorialPopup";
import { unlockAudioOnFirstInput } from "@client/voice/audioUnlock";
import { Windows } from "@client/ui/Windows";
import styles from "@client/ui/Desktop.module.css";
import "@client/ui/themes/themes.css";

export function Desktop(): ReactElement {
  const [store] = useState(() =>
    createDesktopStore(AppList, DesktopIconGrid, DesktopLayout.TaskbarHeight),
  );
  const screenRef = useRef<HTMLDivElement>(null);
  const desktop = useMemo<DesktopContextValue>(() => ({ store, screenRef }), [store]);
  useCallPopups(store);
  useTutorialPopup(store);
  // Also after a refresh mid-shift, when there's no Clock In click to do it.
  useEffect(() => unlockAudioOnFirstInput(), []);
  // While another tab has the game, nothing here can be clicked, typed in or focused.
  const replaced = useConnection().status === "replaced";
  // The save's equipped cosmetics (the defaults until a save is picked).
  const { theme, wallpaper } = useStats();

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
          <div className={styles.layers} inert={replaced}>
            {/* Clicking the bare wallpaper closes the start menu. */}
            <div className={styles.wallpaper} onClick={() => store.setStartMenuOpen(false)} />
            <DesktopIcons />
            <Windows />
            <ClockIn />
            <Taskbar />
            <StartMenu />
            <ShiftResults />
            <SavePicker />
          </div>
          <SessionOverlay />
        </div>
      </div>
    </DesktopContext>
  );
}
