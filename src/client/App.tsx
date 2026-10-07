// Placeholder page for step 0: proves the client reaches the server over Socket.IO.
// Step 1 replaces it with the desktop.

import type { ReactElement } from "react";
import styles from "@client/App.module.css";
import { type ConnectionStatus, useConnection } from "@client/state/connectionStore";

const StatusText: Record<ConnectionStatus, string> = {
  connecting: "connecting...",
  connected: "connected",
  disconnected: "disconnected",
};

export function App(): ReactElement {
  const { status, serverMessage } = useConnection();

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>ScamGPT</h1>
      <p className={styles.status} data-status={status}>
        Server: {StatusText[status]}
      </p>
      {serverMessage !== null && <p className={styles.message}>{serverMessage}</p>}
    </main>
  );
}
