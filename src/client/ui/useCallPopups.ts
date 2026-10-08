// Makes the desktop react to calls: opens the Phone when it rings and the Call window when
// it's answered. Opening a window that's already open just brings it to the front.

import { useEffect } from "react";
import type { DesktopStore } from "@client/ui/desktopStore";
import { useCall } from "@client/state/callStore";

export function useCallPopups(store: DesktopStore): void {
  const { status } = useCall();

  useEffect(() => {
    if (status === "ringing") {
      store.openApp("Phone");
    } else if (status === "inCall") {
      store.closeApp("Phone");
      store.openApp("Call");
    }
  }, [status, store]);
}
