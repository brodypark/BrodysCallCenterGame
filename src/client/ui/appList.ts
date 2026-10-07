// Every app the desktop can open, in the order they appear as desktop icons and in the
// start menu. Plain data, so the desktop store and its tests don't need React.

import type { Rect } from "@client/ui/desktopGrid";

export const AppIds = [
  "Phone",
  "Call",
  "Redeem",
  "Wobblebucks",
  "Stats",
  "Shop",
  "Tutorial",
] as const;

export type AppId = (typeof AppIds)[number];

export interface AppInfo {
  id: AppId;
  title: string;
  // Placeholder until there are pixel-art icons.
  icon: string;
  // The colored square behind the desktop icon. The same in every desktop theme, like real
  // app icons.
  tileColor: string;
  // Where the window first opens, as fractions of the desktop.
  layout: Rect;
}

export const Apps: Readonly<Record<AppId, AppInfo>> = {
  Phone: {
    id: "Phone",
    title: "Phone",
    icon: "📞",
    tileColor: "#3e7a26",
    layout: { x: 0.57, y: 0.03, width: 0.2, height: 0.42 },
  },
  // Tall, like a phone.
  Call: {
    id: "Call",
    title: "Call",
    icon: "🎧",
    tileColor: "#5860e6",
    layout: { x: 0.1, y: 0.03, width: 0.27, height: 0.9 },
  },
  Redeem: {
    id: "Redeem",
    title: "Redeem",
    icon: "🎁",
    tileColor: "#e29640",
    layout: { x: 0.57, y: 0.49, width: 0.3, height: 0.38 },
  },
  // Between the Call window and the Redeem app.
  Wobblebucks: {
    id: "Wobblebucks",
    title: "Wobblebucks Machine",
    icon: "💰",
    tileColor: "#9646b4",
    layout: { x: 0.385, y: 0.49, width: 0.175, height: 0.4 },
  },
  Stats: {
    id: "Stats",
    title: "Stats",
    icon: "📊",
    tileColor: "#cd4646",
    layout: { x: 0.79, y: 0.03, width: 0.19, height: 0.42 },
  },
  // On the right, clear of the Clock In panel, which shows whenever the shop is open.
  Shop: {
    id: "Shop",
    title: "Shop",
    icon: "🛒",
    tileColor: "#d74b8c",
    layout: { x: 0.62, y: 0.03, width: 0.36, height: 0.86 },
  },
  // Offset from the Shop, so both title bars show when both are open.
  Tutorial: {
    id: "Tutorial",
    title: "How to Play",
    icon: "📖",
    tileColor: "#14a0c8",
    layout: { x: 0.63, y: 0.06, width: 0.36, height: 0.8 },
  },
};

export const AppList: readonly AppInfo[] = AppIds.map((id) => Apps[id]);
