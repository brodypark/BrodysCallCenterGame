// Characters: a dossier with a page per caller, flipped with Back and Next or picked from the
// index along the top. Callers the player hasn't reached are greyed out with just their
// name. The hints on each page unlock as the player scams that caller; the server only
// sends the ones they've earned (CharacterService).

import { type ReactElement, useState } from "react";
import type {
  CallerHint,
  CallerHintKind,
  Difficulty,
  LockedCallerPage,
  UnlockedCallerPage,
} from "@shared/types";
import { useCharacters } from "@client/state/charactersStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import { Face } from "@client/ui/Face";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Characters.module.css";

// Case file numbers are two digits, e.g. #03.
const CaseNumberDigits = 2;

const HintLabels: Record<CallerHintKind, string> = {
  likes: "Wins them over",
  dislikes: "Makes them angry",
  obsession: "Obsession",
  spendingLimit: "Spending limit",
};

const DifficultyStyles: Record<Difficulty, string | undefined> = {
  Easy: styles.easy,
  Medium: styles.medium,
  Hard: styles.hard,
};

/** What a hint the player hasn't earned says it takes. */
function lockedText(hint: CallerHint): string {
  const { remaining } = hint;
  if (hint.kind === "spendingLimit") {
    return remaining === 1
      ? "Charge their Wobblebucks Card once to find out."
      : `Charge their Wobblebucks Card ${remaining} more times to find out.`;
  }
  return `Scam them ${remaining} more ${remaining === 1 ? "time" : "times"} to find out.`;
}

function UnlockedPage({ page }: { page: UnlockedCallerPage }): ReactElement {
  return (
    <>
      <div className={styles.profile}>
        <div className={styles.mugshot}>
          <Face look={page.face} mood="neutral" speaking={false} />
        </div>
        <div className={styles.facts}>
          <h2 className={styles.name}>{page.name}</h2>
          <span className={cx(styles.difficulty, DifficultyStyles[page.difficulty])}>
            {page.difficulty}
          </span>
          <dl className={styles.factList}>
            <div>
              <dt>Gift card</dt>
              <dd>${page.cardValue}</dd>
            </div>
            <div>
              <dt>Times scammed</dt>
              <dd>{page.scams}</dd>
            </div>
          </dl>
        </div>
      </div>
      <p className={styles.bio}>{page.bio}</p>
      <ul className={styles.hints}>
        {page.hints.map((hint) => (
          <li key={hint.kind} className={cx(styles.hint, hint.text === null && styles.lockedHint)}>
            <span className={styles.hintLabel}>{HintLabels[hint.kind]}</span>
            <span>{hint.text ?? `🔒 ${lockedText(hint)}`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function LockedPage({ page }: { page: LockedCallerPage }): ReactElement {
  return (
    <div className={styles.lockedPage}>
      <div className={cx(styles.mugshot, styles.silhouette)} aria-hidden>
        ?
      </div>
      <h2 className={styles.name}>{page.name}</h2>
      <p>Reach level {page.unlockLevel} to open this file.</p>
    </div>
  );
}

export function Characters(): ReactElement {
  const { pages } = useCharacters();
  // Kept by id, so the same caller stays open when the pages are sent again.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const found = pages.findIndex((each) => each.id === selectedId);
  const index = found === -1 ? 0 : found;
  const page = pages[index];

  if (!page) {
    return (
      <div className={app.app}>
        <p className={app.muted}>Opening the files...</p>
      </div>
    );
  }

  const caseNumber = String(index + 1).padStart(CaseNumberDigits, "0");
  const goTo = (to: number): void => setSelectedId(pages[to]?.id ?? null);

  return (
    <div className={cx(app.app, styles.characters)}>
      <nav className={styles.index} aria-label="Callers">
        {pages.map((each, eachIndex) => (
          <button
            key={each.id}
            type="button"
            className={cx(
              controls.button,
              styles.tab,
              !each.unlocked && styles.lockedTab,
              eachIndex === index && controls.pressed,
            )}
            aria-current={eachIndex === index ? "page" : undefined}
            onClick={() => setSelectedId(each.id)}
          >
            {each.unlocked ? each.name : `🔒 ${each.name}`}
          </button>
        ))}
      </nav>

      <article className={styles.folder}>
        <div className={styles.paper}>
          <header className={styles.fileHeader}>
            <span>CASE FILE #{caseNumber}</span>
            <span className={styles.stamp}>{page.unlocked ? "CONFIDENTIAL" : "CLASSIFIED"}</span>
          </header>
          {page.unlocked ? <UnlockedPage page={page} /> : <LockedPage page={page} />}
        </div>
      </article>

      <div className={app.row}>
        <button
          type="button"
          className={controls.button}
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          Back
        </button>
        <span className={app.muted}>
          {index + 1} / {pages.length}
        </span>
        <button
          type="button"
          className={controls.button}
          disabled={index === pages.length - 1}
          onClick={() => goTo(index + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
