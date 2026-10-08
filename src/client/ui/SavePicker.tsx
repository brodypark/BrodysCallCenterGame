// The Save Slots screen: shown over the desktop at the start of every visit (and after
// Switch save), until a save is picked. Each slot can be continued, started fresh if empty,
// or deleted after a confirmation.

import { type ReactElement, useState } from "react";
import type { SaveSlotSummary } from "@shared/types";
import { continueSave, deleteSave, newSave } from "@client/net/saveActions";
import { useConnection } from "@client/state/connectionStore";
import { useSaves } from "@client/state/savesStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import styles from "@client/ui/SavePicker.module.css";

const lastPlayedFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SavePicker(): ReactElement | null {
  const saves = useSaves();
  const online = useConnection().status === "connected";
  // The slot waiting for "Are you sure?" before it's deleted.
  const [confirming, setConfirming] = useState<number | null>(null);
  // Forgotten once a save is picked, so it doesn't reappear on the next visit to the picker.
  const picking = saves !== null && saves.activeSlot === null;
  const [wasPicking, setWasPicking] = useState(picking);
  if (picking !== wasPicking) {
    setWasPicking(picking);
    setConfirming(null);
  }
  if (!saves || !picking || !online) {
    return null;
  }

  return (
    <div className={styles.shade}>
      <section
        className={cx(controls.raised, styles.dialog)}
        role="dialog"
        aria-labelledby="save-picker-title"
      >
        <p id="save-picker-title" className={styles.title}>
          SAVE SLOTS
        </p>
        <ul className={styles.slots}>
          {saves.slots.map((slot) => (
            <li key={slot.slot} className={cx(controls.sunken, styles.slot)}>
              <SlotDetails slot={slot} />
              {confirming === slot.slot ? (
                <div className={styles.actions}>
                  <span className={styles.warning}>Delete it for good?</span>
                  <button
                    type="button"
                    className={controls.button}
                    onClick={() => {
                      deleteSave(slot.slot);
                      setConfirming(null);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className={controls.button}
                    onClick={() => setConfirming(null)}
                  >
                    Keep it
                  </button>
                </div>
              ) : (
                <SlotActions slot={slot} onDelete={() => setConfirming(slot.slot)} />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SlotDetails({ slot }: { slot: SaveSlotSummary }): ReactElement {
  const heading = <p className={styles.slotName}>Slot {slot.slot}</p>;
  if (slot.state === "empty") {
    return (
      <div className={styles.details}>
        {heading}
        <p className={styles.muted}>Empty</p>
      </div>
    );
  }
  if (slot.state === "damaged" || !slot.stats) {
    return (
      <div className={styles.details}>
        {heading}
        <p className={styles.warning}>This save couldn&apos;t be read.</p>
      </div>
    );
  }
  const { stats } = slot;
  return (
    <div className={styles.details}>
      {heading}
      <p>
        ${stats.money} banked · {stats.xp} XP · shifts {stats.shiftsPassed} passed /{" "}
        {stats.shiftsFailed} failed
      </p>
      {slot.updatedAt !== null && (
        <p className={styles.muted}>Last played {lastPlayedFormat.format(slot.updatedAt)}</p>
      )}
    </div>
  );
}

function SlotActions({
  slot,
  onDelete,
}: {
  slot: SaveSlotSummary;
  onDelete: () => void;
}): ReactElement {
  if (slot.state === "empty") {
    return (
      <div className={styles.actions}>
        <button type="button" className={controls.button} onClick={() => newSave(slot.slot)}>
          New Game
        </button>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      {slot.state === "ready" && (
        <button type="button" className={controls.button} onClick={() => continueSave(slot.slot)}>
          Continue
        </button>
      )}
      <button type="button" className={controls.button} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
