import type { ReactElement } from "react";
import { useCall } from "@client/state/callStore";
import styles from "./Desktop.module.css";

export function SuspicionAlert(): ReactElement | null {
  const call = useCall();
  const trust = call.trust;

  // Flash red if they are on the phone and trust is dangerously low (e.g. 30% or less)
  const isDanger = call.status === "onCall" && trust !== null && trust.percent <= 30;

  if (!isDanger) return null;

  return <div className={styles.suspicionAlert} aria-hidden="true" />;
}
