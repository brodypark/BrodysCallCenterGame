// Shop app: spend banked money on shift perks and cosmetics, with a tab each for Perks,
// Wallpapers and Themes. Placeholder until the shop arrives (step 7): the tabs switch, but
// the items are a preview from docs/design.md and can't be bought yet.

import { type ReactElement, useState } from "react";
import { cx } from "@client/ui/classNames";
import controls from "@client/ui/controls.module.css";
import app from "@client/ui/apps/appStyles.module.css";
import styles from "@client/ui/apps/Shop.module.css";

type Tab = "Perks" | "Wallpapers" | "Themes";

interface PreviewItem {
  name: string;
  description: string;
  price: string;
}

const Tabs: readonly Tab[] = ["Perks", "Wallpapers", "Themes"];

const PreviewItems: Readonly<Record<Tab, readonly PreviewItem[]>> = {
  Perks: [
    { name: "Extra Coffee", description: "Longer shifts", price: "$200" },
    { name: "Smooth Talker", description: "Callers start less suspicious", price: "$200" },
    { name: "Sticky Notes", description: "More tries per code", price: "$200" },
  ],
  Wallpapers: [
    { name: "Midnight Blue", description: "A calm night sky", price: "$100" },
    { name: "Sunset Gradient", description: "Orange to purple", price: "$200" },
    { name: "Hacker Grid", description: "Green lines on black", price: "$300" },
    { name: "Pudding Pink", description: "Sweet and wobbly", price: "$400" },
  ],
  Themes: [
    { name: "Dark Mode", description: "Easy on the eyes", price: "$200" },
    { name: "Bubblegum", description: "Pink and bubbly", price: "$300" },
    { name: "Terminal Green", description: "Very serious hacking", price: "$400" },
  ],
};

export function Shop(): ReactElement {
  const [tab, setTab] = useState<Tab>("Perks");

  return (
    <div className={app.app}>
      <div className={styles.tabs} role="tablist">
        {Tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === tab}
            className={cx(controls.button, styles.tab, name === tab && controls.pressed)}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <ul className={cx(controls.sunken, styles.items)}>
        {PreviewItems[tab].map((item) => (
          <li key={item.name} className={styles.item}>
            <div>
              <div className={styles.name}>{item.name}</div>
              <div className={app.muted}>{item.description}</div>
            </div>
            <button type="button" className={controls.button} disabled>
              {item.price}
            </button>
          </li>
        ))}
      </ul>
      <p className={cx(controls.sunken, app.status)}>
        Spend your banked money. Everything you buy is yours to keep.
      </p>
    </div>
  );
}
