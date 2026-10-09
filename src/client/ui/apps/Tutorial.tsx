// How to Play: a few short pages on how the game works, flipped with Back and Next. It
// opens by itself the first time a save is played (useTutorialPopup) until it's closed.
// Numbers come from the server's shift snapshot, Config and the player's perks, so the text
// stays right.

import { type ReactElement, type ReactNode, useState } from "react";
import { Config } from "@shared/Config";
import type { PlayerStats } from "@shared/stats";
import { formatClock } from "@shared/time";
import type { ShiftSnapshot } from "@shared/types";
import { extraRedeemTries } from "@shared/Upgrades";
import { useShift } from "@client/state/shiftStore";
import { useStats } from "@client/state/statsStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Tutorial.module.css";

interface Page {
  title: string;
  // Each one is a bullet point.
  lines: readonly ReactNode[];
}

/** The pages, with this save's quota, shift length and tries (perks included). */
function buildPages(shift: ShiftSnapshot, stats: PlayerStats): readonly Page[] {
  const shiftTime = formatClock(shift.lengthSeconds);
  const codeTries = Config.Redeem.TriesPerCode + extraRedeemTries(stats);
  return [
    {
      title: "💼 1. The Core Loop",
      lines: [
        <>Click <b>Clock In</b> to start your shift. Your goal is to meet the daily quota (<b>${shift.quota}</b>) before the <b>{shiftTime}</b> timer runs out.</>,
        <>Answer the <b>Phone</b> when it rings and use the <b>Call</b> app to talk to the victim.</>,
        <>Watch their <b>Trust</b> bar. Say the wrong thing and they'll get suspicious and hang up.</>,
      ],
    },
    {
      title: "🎙️ 2. Social Engineering",
      lines: [
        <>Hold <b>V</b> (or the 🎤 button) to use your microphone, or type your response.</>,
        <>Every caller has a unique personality and obsession. Adapt your persona to match theirs to gain trust.</>,
        <>Once they trust you enough, they will read out a <b>Gift Card Code</b>.</>,
        <><b>WARNING:</b> Keep an ear out for <i>Bait Callers</i>. If their setup sounds too perfect or they try to stall, hang up. Redeeming a bait code will get you hacked.</>
      ],
    },
    {
      title: "💸 3. Cashing Out",
      lines: [
        <>Type the gift card code (e.g. GMA-7QZ) into the <b>Redeem</b> app. You get {codeTries} tries before it locks.</>,
        <><b>Wobblebucks:</b> Some callers have a side problem (like a loud PC). Fix it for a fee and they'll read their credit card ({Config.Card.Prefix}-...).</>,
        <>Run credit cards in the <b>Wobblebucks Machine</b>. Guess the maximum they can afford without getting declined! You get {Config.Card.TriesPerCard} tries.</>,
      ],
    },
    {
      title: "📈 4. Progression & Audits",
      lines: [
        <>Meeting your quota banks your earnings. Failing means you lose the shift's money, but keep the XP.</>,
        <>Between shifts, use the <b>Shop</b> to buy perks and cosmetics with your banked money.</>,
        <>Level up to unlock new callers in the <b>Characters</b> app.</>,
        <><b>Audits:</b> Your boss Skibidi might email you a secret mid-call objective. Complete it for bonus XP and cash, but fail and he'll raise your quota!</>
      ],
    },
  ];
}

export function Tutorial(): ReactElement {
  const pages = buildPages(useShift().snapshot, useStats());
  const [pageIndex, setPageIndex] = useState(0);
  const page = pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === pages.length - 1;

  return (
    <div className={app.app}>
      <div className={cx(controls.sunken, styles.page)}>
        <h2 className={styles.title}>{page?.title}</h2>
        <ul className={styles.lines}>
          {page?.lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </div>
      <div className={app.row}>
        <button
          type="button"
          className={controls.button}
          disabled={isFirst}
          onClick={() => setPageIndex(pageIndex - 1)}
        >
          Back
        </button>
        <span className={app.muted}>
          {pageIndex + 1} / {pages.length}
        </span>
        <button
          type="button"
          className={controls.button}
          disabled={isLast}
          onClick={() => setPageIndex(pageIndex + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
