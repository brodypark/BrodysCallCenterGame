// The whole computer screen: wallpaper, desktop icons, app windows, taskbar and start menu.
// It renders inside whatever element it's given (the full page today, a monitor in a shared
// office later): a 16:9 screen sized to that element, never to the browser window, with
// black bars around it. Everything inside scales with the screen.

import { type ReactElement, useMemo, useRef, useState } from "react";
import { AppList } from "@client/ui/appList";
import { DesktopContext, type DesktopContextValue } from "@client/ui/DesktopContext";
import { DesktopIcons } from "@client/ui/DesktopIcons";
import { createDesktopStore } from "@client/ui/desktopStore";
import { DesktopIconGrid, DesktopLayout, layoutVars } from "@client/ui/layout";
import { StartMenu } from "@client/ui/StartMenu";
import { Taskbar } from "@client/ui/Taskbar";
import { DefaultTheme, DefaultWallpaper } from "@client/ui/themes/themeIds";
import { Windows } from "@client/ui/Windows";
import styles from "@client/ui/Desktop.module.css";
import "@client/ui/themes/themes.css";

export function Desktop(): ReactElement {
  const [store] = useState(() =>
    createDesktopStore(AppList, DesktopIconGrid, DesktopLayout.TaskbarHeight),
  );
  const screenRef = useRef<HTMLDivElement>(null);
  const desktop = useMemo<DesktopContextValue>(() => ({ store, screenRef }), [store]);

  return (
    <DesktopContext value={desktop}>
      <div className={styles.host}>
        <div
          ref={screenRef}
          className={styles.screen}
          style={layoutVars}
          data-desktop-screen=""
          data-theme={DefaultTheme}
          data-wallpaper={DefaultWallpaper}
        >
          {/* Clicking the bare wallpaper closes the start menu. */}
          <div className={styles.wallpaper} onClick={() => store.setStartMenuOpen(false)} />
          <DesktopIcons />
          <Windows />
          <Taskbar />
          <StartMenu />
        </div>
      </div>
    </DesktopContext>
  );
}
