// Every open app's window. They're drawn in the order they were opened, so focusing one
// never moves anything in the page (which would drop keyboard focus); z-index stacks them.

import type { ReactElement } from "react";
import { AppErrorBoundary } from "@client/ui/AppErrorBoundary";
import { Apps } from "@client/ui/appList";
import { AppComponents } from "@client/ui/apps";
import { useDesktop, useDesktopState } from "@client/ui/DesktopContext";
import { Window } from "@client/ui/Window";
import styles from "@client/ui/Windows.module.css";

export function Windows(): ReactElement {
  const { store } = useDesktop();
  const { openOrder, stackOrder, windowPositions } = useDesktopState();
  const focused = stackOrder.at(-1);

  return (
    <div className={styles.layer}>
      {openOrder.map((id) => {
        const app = Apps[id];
        const Content = AppComponents[id];
        return (
          <Window
            key={id}
            app={app}
            position={windowPositions[id] ?? app.layout}
            stackIndex={stackOrder.indexOf(id)}
            focused={id === focused}
          >
            <AppErrorBoundary appTitle={app.title}>
              <Content close={() => store.closeApp(id)} />
            </AppErrorBoundary>
          </Window>
        );
      })}
    </div>
  );
}
