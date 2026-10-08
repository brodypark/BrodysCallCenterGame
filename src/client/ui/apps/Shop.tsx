// Shop app: spend banked money on shift perks and cosmetics, with a tab each for Perks,
// Wallpapers and Themes. Only open between shifts. The server checks and applies every
// purchase; this only asks and shows the answer.

import { type ReactElement, useState } from "react";
import {
  maxTier,
  nextPrice,
  tierOf,
  type Upgrade,
  type UpgradeKind,
  upgradesOfKind,
} from "@shared/Upgrades";
import type { PlayerStats } from "@shared/stats";
import type { ShopResult } from "@shared/types";
import { buyUpgrade, equipCosmetic } from "@client/net/shopActions";
import { useConnection } from "@client/state/connectionStore";
import { useGameMode } from "@client/state/savesStore";
import { useShift } from "@client/state/shiftStore";
import { useStats } from "@client/state/statsStore";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Shop.module.css";

const Tabs: readonly { kind: UpgradeKind; title: string }[] = [
  { kind: "perk", title: "Perks" },
  { kind: "wallpaper", title: "Wallpapers" },
  { kind: "theme", title: "Themes" },
];

const OpenStatus = "Spend your banked money. Everything you buy is yours to keep.";
const ClosedStatus = "The shop is closed during shifts.";
const NoAnswer = "Couldn't reach the shop. Try again.";

function isEquipped(stats: PlayerStats, upgrade: Upgrade): boolean {
  return (
    (upgrade.kind === "wallpaper" && stats.wallpaper === upgrade.id) ||
    (upgrade.kind === "theme" && stats.theme === upgrade.id)
  );
}

export function Shop(): ReactElement {
  const saved = useStats();
  // Sandbox money is unlimited (the server makes every purchase free).
  const sandbox = useGameMode() === "sandbox";
  const stats = sandbox ? { ...saved, money: Number.POSITIVE_INFINITY } : saved;
  const online = useConnection().status === "connected";
  const open = useShift().snapshot.status === "offShift";
  const [tab, setTab] = useState<UpgradeKind>("perk");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ShopResult | null>(null);
  const usable = online && open && !busy;

  async function run(ask: () => Promise<ShopResult | null>): Promise<void> {
    setBusy(true);
    const result = await ask();
    setBusy(false);
    setAnswer(result ?? { success: false, message: NoAnswer });
  }

  const status = !open ? ClosedStatus : (answer?.message ?? OpenStatus);

  return (
    <div className={app.app}>
      <div className={styles.tabs} role="tablist">
        {Tabs.map(({ kind, title }) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={kind === tab}
            className={cx(controls.button, styles.tab, kind === tab && controls.pressed)}
            onClick={() => setTab(kind)}
          >
            {title}
          </button>
        ))}
      </div>
      <p className={app.muted}>Bank: {sandbox ? "$∞ (Sandbox)" : `$${stats.money}`}</p>
      <ul className={cx(controls.sunken, styles.items)}>
        {upgradesOfKind(tab).map((upgrade) => (
          <ShopItem
            key={upgrade.id}
            upgrade={upgrade}
            stats={stats}
            usable={usable}
            onBuy={() => void run(() => buyUpgrade(upgrade.id))}
            onEquip={() => void run(() => equipCosmetic(upgrade.id))}
          />
        ))}
      </ul>
      <p
        className={cx(
          controls.sunken,
          app.status,
          open && answer && (answer.success ? styles.success : styles.error),
        )}
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}

interface ShopItemProps {
  upgrade: Upgrade;
  stats: PlayerStats;
  usable: boolean;
  onBuy: () => void;
  onEquip: () => void;
}

function ShopItem({ upgrade, stats, usable, onBuy, onEquip }: ShopItemProps): ReactElement {
  const tier = tierOf(stats, upgrade.id);
  const price = nextPrice(stats, upgrade);
  const owned = tier > 0;

  let action: ReactElement;
  if (upgrade.kind === "perk") {
    action =
      price === null ? (
        <span className={styles.owned}>Maxed out</span>
      ) : (
        <button
          type="button"
          className={controls.button}
          disabled={!usable || stats.money < price}
          onClick={onBuy}
        >
          Buy ${price}
        </button>
      );
  } else if (isEquipped(stats, upgrade)) {
    action = <span className={styles.owned}>Equipped</span>;
  } else if (owned) {
    action = (
      <button type="button" className={controls.button} disabled={!usable} onClick={onEquip}>
        Equip
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        className={controls.button}
        disabled={!usable || price === null || stats.money < price}
        onClick={onBuy}
      >
        Buy ${price ?? 0}
      </button>
    );
  }

  return (
    <li className={styles.item}>
      <div>
        <div className={styles.name}>
          {upgrade.name}
          {upgrade.kind === "perk" && (
            <span className={styles.tier}>
              {" "}
              (tier {tier} / {maxTier(upgrade)})
            </span>
          )}
        </div>
        <div className={app.muted}>{upgrade.description}</div>
      </div>
      {action}
    </li>
  );
}
