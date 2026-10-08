// Holding V talks (push-to-talk), unless the player is typing somewhere: then V is just a
// letter. Only listens while `enabled` (the player's turn), and a key already held when the
// turn comes round doesn't count, so the player always presses fresh to talk.

import { useEffect } from "react";
import { Config } from "@shared/Config";
import { startTalking, stopTalking } from "@client/voice/PlayerVoice";
import { takesTyping } from "@client/voice/playerSpeech";

const TalkKey = Config.PlayerVoice.TalkKey;

export function usePushToTalkKey(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let holding = false;
    const release = (): void => {
      if (holding) {
        holding = false;
        stopTalking();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // While held, its repeats never type (e.g. into the message box after voice fails).
      if (holding && event.code === TalkKey) {
        event.preventDefault();
        return;
      }
      // Ctrl+V and friends are shortcuts, not talking.
      if (
        event.code !== TalkKey ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        return;
      }
      const active = document.activeElement;
      if (takesTyping(active instanceof HTMLElement ? active : null)) {
        return;
      }
      event.preventDefault();
      holding = true;
      startTalking();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      // macOS doesn't send the talk key's key-up if Cmd went down while it was held.
      if (event.code === TalkKey || event.key === "Meta") {
        release();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    // Switching away while holding V means the key-up never arrives here.
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      release();
    };
  }, [enabled]);
}
