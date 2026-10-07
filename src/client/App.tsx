// The page: one desktop filling the browser window. The desktop sizes itself to this
// container, so it can later sit on a monitor in a shared office instead.

import type { ReactElement } from "react";
import { Desktop } from "@client/ui/Desktop";
import styles from "@client/App.module.css";

export function App(): ReactElement {
  return (
    <main className={styles.page}>
      <Desktop />
    </main>
  );
}
