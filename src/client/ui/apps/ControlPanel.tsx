// Control Panel app (Sandbox only): pick who calls next and whether they have a side
// problem, ring a call (Sandbox calls never ring by themselves), bend the call in progress (set the trust bar,
// make them read their code or card, make them hang up), choose AI or scripted replies, and
// change the desktop's look. Every control only asks; the server decides.

import { type ReactElement, useId, useState } from "react";
import { Config } from "@shared/Config";
import { ThemeIds, WallpaperIds } from "@shared/cosmetics";
import { getUpgrade } from "@shared/Upgrades";
import {
  ReplySources,
  type SandboxCheat,
  type SideProblemChoice,
  SideProblemChoices,
} from "@shared/sandbox";
import {
  changeSandbox,
  cheat,
  resetSandbox,
  ringNow,
  setTrust,
  wear,
} from "@client/net/sandboxActions";
import { useCall } from "@client/state/callStore";
import { useConnection } from "@client/state/connectionStore";
import { useSandbox } from "@client/state/sandboxStore";
import { useStats } from "@client/state/statsStore";
import { cx } from "@client/ui/classNames";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/ControlPanel.module.css";

const SideProblemLabels: Record<SideProblemChoice, string> = {
  random: "Random",
  always: "Always",
  never: "Never",
};

const CheatButtons: readonly { cheat: SandboxCheat; label: string }[] = [
  { cheat: "readCode", label: "Read the code" },
  { cheat: "readCard", label: "Read the card" },
  { cheat: "hangUp", label: "Make them hang up" },
];

/** A cosmetic's shop name, or its id if the shop doesn't list it (the defaults). */
function cosmeticName(id: string): string {
  return getUpgrade(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function ControlPanel(): ReactElement {
  const panel = useSandbox();
  const call = useCall();
  const stats = useStats();
  const online = useConnection().status === "connected";
  const group = useId();
  // The trust slider's position while it's being dragged; null shows the real trust.
  const [dragTrust, setDragTrust] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // A drag left over from a turn or call that's moved on is dropped, never sent to the next.
  const turnKey = `${call.status}-${call.turn ?? ""}-${call.playerTurns}`;
  const [seenTurn, setSeenTurn] = useState(turnKey);
  if (turnKey !== seenTurn) {
    setSeenTurn(turnKey);
    setDragTrust(null);
  }

  if (!panel) {
    return <p className={app.muted}>The control panel only works in Sandbox.</p>;
  }
  const { settings, callers } = panel;
  const inCall = call.status === "inCall" && online;
  const playerTurn = inCall && call.turn === "playerTurn";
  const trust = dragTrust ?? call.trust?.percent ?? 0;

  function letGoOfTrust(): void {
    if (dragTrust !== null) {
      setTrust(dragTrust);
      setDragTrust(null);
    }
  }

  return (
    <div className={cx(app.app, styles.panel)}>
      <p className={styles.heading}>SANDBOX CONTROL PANEL</p>

      <fieldset className={styles.section}>
        <legend>Callers</legend>
        <label className={styles.row}>
          Next caller
          <select
            className={styles.field}
            value={settings.nextCaller}
            disabled={!online}
            onChange={(event) => changeSandbox({ nextCaller: event.target.value })}
          >
            <option value={Config.Sandbox.RandomCaller}>Random</option>
            {callers.map((caller) => (
              <option key={caller.id} value={caller.id}>
                {caller.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.row} role="radiogroup" aria-label="Side problem">
          Side problem
          <span className={styles.choices}>
            {SideProblemChoices.map((choice) => (
              <label key={choice}>
                <input
                  type="radio"
                  name={`${group}-side`}
                  checked={settings.sideProblem === choice}
                  disabled={!online}
                  onChange={() => changeSandbox({ sideProblem: choice })}
                />
                {SideProblemLabels[choice]}
              </label>
            ))}
          </span>
        </div>
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.button}
            disabled={!online || call.status !== "idle"}
            onClick={ringNow}
          >
            Ring now
          </button>
          <span style={{ opacity: 0.7, fontSize: '1.4cqh' }}>Calls only ring when you ask.</span>
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Live call</legend>
        <label className={styles.row}>
          Trust
          <input
            type="range"
            min={0}
            max={Config.Sandbox.TrustSliderMax}
            value={trust}
            disabled={!playerTurn}
            onChange={(event) => setDragTrust(Number(event.target.value))}
            onPointerUp={letGoOfTrust}
            onKeyUp={letGoOfTrust}
            onBlur={letGoOfTrust}
          />
          <span className={styles.value}>{inCall ? `${trust}%` : "--"}</span>
        </label>
        <div className={styles.buttons}>
          {CheatButtons.map((button) => (
            <button
              key={button.cheat}
              type="button"
              className={styles.button}
              disabled={!playerTurn}
              onClick={() => cheat(button.cheat)}
            >
              {button.label}
            </button>
          ))}
        </div>
        <p style={{ opacity: 0.7, fontSize: '1.4cqh', margin: 0 }}>
          {inCall ? "Works on your turn." : "Answer a call to use these."}
        </p>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Replies</legend>
        <div className={styles.choices} role="radiogroup" aria-label="Replies">
          {ReplySources.map((source) => (
            <label key={source}>
              <input
                type="radio"
                name={`${group}-replies`}
                checked={settings.replies === source}
                disabled={!online}
                onChange={() => changeSandbox({ replies: source })}
              />
              {source === "ai" ? "AI (Gemini)" : "Scripted"}
            </label>
          ))}
        </div>
        <p style={{ opacity: 0.7, fontSize: '1.4cqh', margin: 0 }}>
          {panel.aiAvailable
            ? "Daily AI and voice limits still apply."
            : "The AI is off on this server, so replies are scripted either way."}
        </p>
      </fieldset>

      <fieldset className={styles.section}>
        <legend>Look</legend>
        <label className={styles.row}>
          Theme
          <select
            className={styles.field}
            value={stats.theme}
            disabled={!online}
            onChange={(event) => wear(event.target.value)}
          >
            {ThemeIds.map((id) => (
              <option key={id} value={id}>
                {cosmeticName(id)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.row}>
          Wallpaper
          <select
            className={styles.field}
            value={stats.wallpaper}
            disabled={!online}
            onChange={(event) => wear(event.target.value)}
          >
            {WallpaperIds.map((id) => (
              <option key={id} value={id}>
                {cosmeticName(id)}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.buttons}>
          {confirmReset ? (
            <>
              <span style={{ fontSize: '1.4cqh' }}>Clear purchases & settings?</span>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  resetSandbox();
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.button}
              disabled={!online}
              onClick={() => setConfirmReset(true)}
            >
              Reset Sandbox
            </button>
          )}
        </div>
      </fieldset>
    </div>
  );
}
