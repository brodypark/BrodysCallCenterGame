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
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { crashed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(`${this.props.appTitle} crashed:`, error);
  }

  override render(): ReactNode {
    if (this.state.crashed) {
      return <p className={styles.message}>This app crashed. Close it and open it again.</p>;
    }
    return this.props.children;
  }
}
