// Says the victim's lines, and tells the server when each one has been said so the turn
// can move on. Until real voices arrive (step 9), "saying" a line just takes as long as
// reading it would (fakeSpeakingSeconds). Step 9 swaps the timer for playing the audio.
// The server has its own safety timer in case this never reports back.

import { fakeSpeakingSeconds } from "@shared/speechTiming";
import { secondsToMs } from "@shared/time";
import { finishedSpeaking } from "@client/net/callActions";
import { socket } from "@client/net/socket";
import { callStore } from "@client/state/callStore";
import { currentVictimLine } from "@client/voice/victimLine";

// The line being said right now, and when it will be done.
let speaking: { lineId: number; timer: ReturnType<typeof setTimeout> } | null = null;
// The line the server has been told is done, so it isn't reported twice. Line ids start
// over when the server forgets a player (a restart, or a long disconnect), so this is
// forgotten between lines and on every new connection rather than compared as a number.
let reportedLineId: number | null = null;

function stopSpeaking(): void {
  if (speaking) {
    clearTimeout(speaking.timer);
    speaking = null;
  }
}

function onCallChanged(): void {
  const line = currentVictimLine(callStore.get());
  if (!line) {
    // The call ended, or the turn moved on.
    stopSpeaking();
    reportedLineId = null;
    return;
  }
  if (speaking?.lineId === line.lineId || reportedLineId === line.lineId) {
    return;
  }
  stopSpeaking();
  const { lineId } = line;
  speaking = {
    lineId,
    timer: setTimeout(
      () => {
        speaking = null;
        // If it couldn't be sent (offline), the next snapshot after reconnecting tries again.
        if (finishedSpeaking(lineId)) {
          reportedLineId = lineId;
        }
      },
      secondsToMs(fakeSpeakingSeconds(line.text)),
    ),
  };
}

function onConnect(): void {
  // A report sent just before a disconnect may have been lost; the server ignores repeats.
  stopSpeaking();
  reportedLineId = null;
}

/** Starts saying victim lines as they arrive. Call once when the page loads. */
export function startVictimVoice(): void {
  socket.on("connect", onConnect);
  callStore.subscribe(onCallChanged);
  onCallChanged();
}
