// Push-to-talk with the browser's own speech recognition: holding the talk key listens,
// letting go sends what was heard as the player's message. Nothing is recorded or uploaded
// by the game; the text goes through the same send as typing, and the server checks it the
// same way. The browser asks for the mic the first time recognition starts, so the player
// is only asked when they first try to talk.
//
// A talk: idle -> (start) listening -> (stop) finishing -> (final words, or a short wait)
// idle, sending the words. An error, the turn moving on, or a disconnect drops it unsent.
// If voice can't work here (no support, mic blocked or missing), it's switched off for the
// page and the player is told to type.
//
// Kept free of the socket and stores so it can be tested; PlayerVoice wires it up.

import { Config } from "@shared/Config";
import { cleanMessage } from "@shared/messageText";
import { secondsToMs } from "@shared/time";
import { createStore, type Store } from "@client/state/createStore";
import {
  NothingHeardNotice,
  shortenTranscript,
  type SpeechFailure,
  speechFailure,
  UnsupportedNotice,
} from "@client/voice/playerSpeech";

/** The parts of the browser's SpeechRecognition this uses. TypeScript's DOM types have its
 * events but not the class itself, which some browsers still only have as
 * webkitSpeechRecognition. */
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type TalkStatus = "idle" | "listening" | "finishing";

export interface PlayerVoiceState {
  status: TalkStatus;
  // The words heard so far this talk, shown while listening.
  heard: string;
  // False once voice can't work on this page; the player types instead.
  available: boolean;
  // A short message for the player, e.g. "Mic blocked", or null.
  notice: string | null;
}

export interface PushToTalkOptions {
  // Makes a new recognition, or null if this browser has none.
  createRecognition: (() => Recognition) | null;
  // True while the player may talk: in a call, on their turn, connected.
  canTalk: () => boolean;
  // Sends the player's words as their message.
  send: (text: string) => void;
}

export interface PushToTalk {
  state: Pick<Store<PlayerVoiceState>, "get" | "subscribe">;
  /** Starts listening (the talk key went down). Does nothing if it isn't the player's turn. */
  start: () => void;
  /** Stops listening and sends what was heard (the talk key came up). */
  stop: () => void;
  /** Drops the talk in progress without sending it, e.g. when the turn moves on. */
  cancel: () => void;
  /** Stops everything, e.g. when the page is being torn down. */
  dispose: () => void;
}

interface Talk {
  recognition: Recognition;
  heard: string;
  // Lets go by itself at Config.PlayerVoice.MaxTalkSeconds, then waits for the final words.
  timer: ReturnType<typeof setTimeout> | null;
}

/** Joins every result's best guess into one line. */
function transcriptOf(results: ArrayLike<ArrayLike<{ transcript: string }>>): string {
  const parts: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const best = results[index]?.[0]?.transcript;
    if (best) {
      parts.push(best.trim());
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function createPushToTalk(options: PushToTalkOptions): PushToTalk {
  const store = createStore<PlayerVoiceState>({
    status: "idle",
    heard: "",
    available: options.createRecognition !== null,
    notice: null,
  });
  let talk: Talk | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  // Why voice is off for good, repeated if the player tries to talk again.
  let offReason: string | null = options.createRecognition ? null : UnsupportedNotice;

  function update(change: Partial<PlayerVoiceState>): void {
    store.set({ ...store.get(), ...change });
  }

  function clearNoticeTimer(): void {
    if (noticeTimer !== null) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
  }

  function showNotice(notice: string): void {
    clearNoticeTimer();
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      update({ notice: null });
    }, secondsToMs(Config.PlayerVoice.NoticeSeconds));
    update({ notice });
  }

  function fail(failure: SpeechFailure): void {
    if (failure.permanent) {
      offReason = failure.notice;
      update({ available: false });
    }
    if (failure.notice !== null) {
      showNotice(failure.notice);
    }
  }

  /** Ends `current` and returns what it heard, or null if it was already over. */
  function endTalk(current: Talk): string | null {
    if (talk !== current) {
      return null;
    }
    talk = null;
    if (current.timer !== null) {
      clearTimeout(current.timer);
    }
    const { recognition } = current;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      // Does nothing if it has already ended.
      recognition.abort();
    } catch {
      // Already gone.
    }
    update({ status: "idle", heard: "" });
    return current.heard;
  }

  /** The talk is over: sends what it heard, if anything and if the turn is still theirs. */
  function finish(current: Talk): void {
    const heard = endTalk(current);
    if (heard === null) {
      return;
    }
    const text = cleanMessage(shortenTranscript(heard, Config.Call.MaxTypedMessageLength));
    if (text === null) {
      fail({ notice: NothingHeardNotice, permanent: false });
      return;
    }
    if (options.canTalk()) {
      options.send(text);
    }
  }

  function start(): void {
    if (talk !== null || !options.canTalk()) {
      return;
    }
    if (offReason !== null || options.createRecognition === null) {
      fail({ notice: offReason ?? UnsupportedNotice, permanent: true });
      return;
    }
    let recognition: Recognition;
    try {
      recognition = options.createRecognition();
      recognition.lang = Config.PlayerVoice.Language;
      // Keeps listening through pauses until the key comes up.
      recognition.continuous = true;
      // Shows the words as they're heard.
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
    } catch {
      fail({ notice: UnsupportedNotice, permanent: true });
      return;
    }
    const current: Talk = { recognition, heard: "", timer: null };
    recognition.onresult = (event) => {
      if (talk === current) {
        current.heard = transcriptOf(event.results);
        update({ heard: current.heard });
      }
    };
    recognition.onerror = (event) => {
      if (endTalk(current) !== null) {
        fail(speechFailure(event.error));
      }
    };
    // Fires after stop() once the final words are in, or if the browser stops on its own
    // (e.g. a long silence); either way, send what was heard.
    recognition.onend = () => finish(current);
    talk = current;
    current.timer = setTimeout(stop, secondsToMs(Config.PlayerVoice.MaxTalkSeconds));
    clearNoticeTimer();
    update({ status: "listening", heard: "", notice: null });
    try {
      recognition.start();
    } catch {
      endTalk(current);
      fail(speechFailure(""));
    }
  }

  function stop(): void {
    const current = talk;
    if (current === null || store.get().status !== "listening") {
      return;
    }
    update({ status: "finishing" });
    if (current.timer !== null) {
      clearTimeout(current.timer);
    }
    // If the browser never says it's done, send what it heard so far.
    current.timer = setTimeout(
      () => finish(current),
      secondsToMs(Config.PlayerVoice.ResultWaitSeconds),
    );
    try {
      current.recognition.stop();
    } catch {
      finish(current);
    }
  }

  function cancel(): void {
    if (talk !== null) {
      endTalk(talk);
    }
  }

  return {
    state: store,
    start,
    stop,
    cancel,
    dispose: () => {
      cancel();
      clearNoticeTimer();
    },
  };
}
