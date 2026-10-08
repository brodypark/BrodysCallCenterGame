// The popup menu above the start button. Lists every app (choosing one opens it), then
// Switch save, which goes back to the save slots (only between shifts).

import type { ReactElement } from "react";
import { leaveSave } from "@client/net/saveActions";
import { useShift } from "@client/state/shiftStore";
import { AppList } from "@client/ui/appList";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import styles from "@client/ui/StartMenu.module.css";

const BannerText = "ScamOS";

export function StartMenu(): ReactElement | null {
  const { store } = useDesktop();
  const { startMenuOpen } = useDesktopState();
  const onShift = useShift().snapshot.status !== "offShift";
  if (!startMenuOpen) {
    return null;
  }

  return (
    <div className={cx(controls.raised, styles.menu)}>
      <div className={styles.banner}>
        <span className={styles.bannerText}>{BannerText}</span>
      </div>
      <ul className={styles.items}>
        {AppList.map((app) => (
          <li key={app.id} className={styles.row}>
            <button type="button" className={styles.item} onClick={() => store.openApp(app.id)}>
              <span aria-hidden>{app.icon}</span> {app.title}
            </button>
          </li>
        ))}
        <li className={cx(styles.row, styles.separated)}>
          <button
            type="button"
            className={styles.item}
            disabled={onShift}
            title={onShift ? "Finish your shift first" : undefined}
            onClick={() => {
              store.setStartMenuOpen(false);
              leaveSave();
            }}
          >
            <span aria-hidden>💾</span> Switch save
          </button>
        </li>
      </ul>
    </div>
  );
}
