// Catches an app that crashes while rendering, so it shows a message in its own window
// instead of taking the whole desktop down. React only supports this with a class.

import { Component, type ReactNode } from "react";
import styles from "@client/ui/AppErrorBoundary.module.css";

interface AppErrorBoundaryProps {
  appTitle: string;
  children: ReactNode;
}

interface AppErrorBoundaryState {
  crashed: boolean;
  error?: Error;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { crashed: true, error };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.appTitle} crashed:`, error);
  }

  override render(): ReactNode {
    if (this.state.crashed) {
      return (
        <div className={styles.message}>
          <p>This app crashed. Close it and open it again.</p>
          <pre style={{ fontSize: '10px', color: 'red', marginTop: '10px', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message || String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
