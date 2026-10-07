// How to Play: a few short pages on how the game works, flipped with Back and Next. The
// text is ported from the Roblox version with today's design numbers written in; step 7
// builds it from Config and the player's perks, and opens it by itself until it's closed.

import { type ReactElement, type ReactNode, useState } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Tutorial.module.css";

interface Page {
  title: string;
  // Each one is a bullet point.
  lines: readonly ReactNode[];
}

const Pages: readonly Page[] = [
  {
    title: "💼 The Job",
    lines: [
      <>
        Click <b>Clock In</b> to start a shift. Earn <b>$150</b> in <b>8:00</b> to get PROMOTED.
      </>,
      "Fall short and you're FIRED: you lose that shift's money, but keep your XP.",
    ],
  },
  {
    title: "📞 Calls",
    lines: [
      <>
        Answer the <b>Phone</b> when it rings, then talk in the <b>Call</b> app.
      </>,
      <>
        Play along with the caller&apos;s quirks. Watch the <b>Trust</b> bar: if they get too
        suspicious, they hang up.
      </>,
      "Win them over and they'll read you a gift card code.",
    ],
  },
  {
    title: "🎁 Cards",
    lines: [
      <>
        <b>Gift cards</b> (like GMA-7QZ): type the code into <b>Redeem</b>. You get 3 tries.
      </>,
      <>
        Some callers have a second problem. Offer to fix it for a fee and they&apos;ll read you
        their <b>Wobblebucks Card</b> (WBK-...).
      </>,
      <>
        Charge it in the <b>Wobblebucks Machine</b>. Go over their secret limit and it&apos;s
        declined. You get 2 tries.
      </>,
    ],
  },
  {
    title: "🎮 Controls",
    lines: [
      <>
        Hold <b>V</b> (or the 🎤 button) to talk on your turn, or type and press <b>Enter</b>.
      </>,
      "Drag windows by their title bar, and icons wherever you like.",
      <>
        Between shifts, spend your bank in the <b>Shop</b>. Level up to unlock new callers.
      </>,
    ],
  },
];

export function Tutorial(): ReactElement {
  const [pageIndex, setPageIndex] = useState(0);
  const page = Pages[pageIndex];
  const isFirst = pageIndex === 0;
  const isLast = pageIndex === Pages.length - 1;

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
          {pageIndex + 1} / {Pages.length}
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
