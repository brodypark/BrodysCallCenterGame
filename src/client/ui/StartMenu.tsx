// The popup menu above the start button. Lists every app (choosing one opens it), then
// Switch save, which goes back to the save slots (only between shifts).

import type { ReactElement } from "react";
import { appsFor } from "@client/ui/appList";
import { useGameMode } from "@client/state/savesStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import styles from "@client/ui/StartMenu.module.css";

const BannerText = "ScamOS";

export function StartMenu(): ReactElement | null {
  const { store } = useDesktop();
  const { startMenuOpen } = useDesktopState();
  const mode = useGameMode();

  if (!startMenuOpen) {
    return null;
  }

  return (
    <div className={cx(controls.raised, styles.menu)}>
      <div className={styles.banner}>
        <span className={styles.bannerText}>{BannerText}</span>
      </div>
      <ul className={styles.items}>
        {appsFor(mode).map((app) => (
          <li key={app.id} className={styles.row}>
            <button type="button" className={styles.item} onClick={() => store.openApp(app.id)}>
              <span aria-hidden>{app.icon}</span> {app.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
