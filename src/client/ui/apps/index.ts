// Which component draws each app inside its window.

import type { ComponentType } from "react";
import type { AppId } from "@client/ui/appList";
import { Call } from "@client/ui/apps/Call";
import { ControlPanel } from "@client/ui/apps/ControlPanel";
import { Phone } from "@client/ui/apps/Phone";
import { Redeem } from "@client/ui/apps/Redeem";
import { Settings } from "@client/ui/apps/Settings";
import { Shop } from "@client/ui/apps/Shop";
import { Stats } from "@client/ui/apps/Stats";
import { Tutorial } from "@client/ui/apps/Tutorial";
import { Wobblebucks } from "@client/ui/apps/Wobblebucks";
import { Notepad } from "@client/ui/apps/Notepad";
import { Email } from "@client/ui/apps/Email";

export interface AppProps {
  // Closes the app's own window, for apps with their own way out.
  close: () => void;
}

export const AppComponents: Readonly<Record<AppId, ComponentType<AppProps>>> = {
  Phone,
  Call,
  Redeem,
  Wobblebucks,
  Stats,
  Shop,
  Tutorial,
  Settings,
  Notepad,
  Email,
  ControlPanel,
};
