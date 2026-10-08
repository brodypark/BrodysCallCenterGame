// The player's push-to-talk for this page: the browser's speech recognition (pushToTalk),
// sending through the same call:send as typing. Talking is only for the player's turn while
// connected; the moment that stops being true (the victim's turn, hanging up, a disconnect)
// any talk in progress is dropped, so the mic is never on during the victim's turn.

import { sendMessage } from "@client/net/callActions";
import { socket } from "@client/net/socket";
import { callStore } from "@client/state/callStore";
import { useStore } from "@client/state/createStore";
import {
  createPushToTalk,
  type PlayerVoiceState,
  type Recognition,
} from "@client/voice/pushToTalk";

type RecognitionConstructor = new () => Recognition;

/** The browser's speech recognition class, if it has one (Chrome, Edge and Safari do;
 * Firefox doesn't). */
function findRecognition(): RecognitionConstructor | null {
  // Not in TypeScript's DOM types (see Recognition), so looked up by name.
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function canTalk(): boolean {
  const call = callStore.get();
  return socket.connected && call.status === "inCall" && call.turn === "playerTurn";
}

const RecognitionClass = findRecognition();

const playerVoice = createPushToTalk({
  createRecognition: RecognitionClass && (() => new RecognitionClass()),
  canTalk,
  send: sendMessage,
});

function dropIfNotTheirTurn(): void {
  if (!canTalk()) {
    playerVoice.cancel();
  }
}

/** Starts listening (talk key or button down). */
export const startTalking: () => void = playerVoice.start;
/** Stops listening and sends what was heard (talk key or button up). */
export const stopTalking: () => void = playerVoice.stop;
/** Drops the talk in progress unsent, e.g. when the player sends a typed message instead. */
export const cancelTalking: () => void = playerVoice.cancel;

let unsubscribe: (() => void) | null = null;

/** Drops talks that outlive the player's turn. Call once when the page loads. */
export function startPlayerVoice(): void {
  unsubscribe?.();
  unsubscribe = callStore.subscribe(dropIfNotTheirTurn);
  socket.off("disconnect", dropIfNotTheirTurn);
  socket.on("disconnect", dropIfNotTheirTurn);
}

// When Vite hot-reloads this module in development, stop the old copy.
import.meta.hot?.dispose(() => {
  unsubscribe?.();
  socket.off("disconnect", dropIfNotTheirTurn);
  playerVoice.dispose();
});

/** Push-to-talk's state; re-renders the component when it changes. */
export function usePlayerVoice(): PlayerVoiceState {
  return useStore(playerVoice.state);
}
