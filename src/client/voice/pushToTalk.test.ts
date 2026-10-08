import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "@shared/Config";
import { secondsToMs } from "@shared/time";
import { createPushToTalk, type PushToTalk, type Recognition } from "@client/voice/pushToTalk";
import { NothingHeardNotice, UnsupportedNotice } from "@client/voice/playerSpeech";

/** A stand-in for the browser's speech recognition that the test drives by hand. */
class FakeRecognition implements Recognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  started = false;
  stopped = false;
  aborted = false;

  start(): void {
    if (refuseToStart) {
      throw new Error("InvalidStateError");
    }
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
  }

  /** The browser heard these phrases so far. */
  hear(...phrases: string[]): void {
    this.onresult?.({ results: phrases.map((transcript) => [{ transcript }]) });
  }
  end(): void {
    this.onend?.();
  }
  fail(error: string): void {
    this.onerror?.({ error });
    this.onend?.();
  }
}

let recognitions: FakeRecognition[];
let sent: string[];
let playerTurn: boolean;
// Makes the next recognitions throw on start(), like a browser that refuses.
let refuseToStart: boolean;

function setUp(supported = true): PushToTalk {
  return createPushToTalk({
    createRecognition: supported
      ? () => {
          const recognition = new FakeRecognition();
          recognitions.push(recognition);
          return recognition;
        }
      : null,
    canTalk: () => playerTurn,
    send: (text) => sent.push(text),
  });
}

function latest(): FakeRecognition {
  const recognition = recognitions.at(-1);
  if (!recognition) {
    throw new Error("No recognition was started.");
  }
  return recognition;
}

beforeEach(() => {
  vi.useFakeTimers();
  recognitions = [];
  sent = [];
  playerTurn = true;
  refuseToStart = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("push-to-talk", () => {
  it("listens on start and sends what was heard once the browser finishes", () => {
    const voice = setUp();
    voice.start();
    expect(latest().started).toBe(true);
    expect(latest().continuous).toBe(true);
    expect(latest().lang).toBe(Config.PlayerVoice.Language);
    expect(voice.state.get().status).toBe("listening");

    latest().hear("hello", " grandma ");
    expect(voice.state.get().heard).toBe("hello grandma");

    voice.stop();
    expect(latest().stopped).toBe(true);
    expect(voice.state.get().status).toBe("finishing");
    expect(sent).toEqual([]);

    latest().end();
    expect(sent).toEqual(["hello grandma"]);
    expect(voice.state.get()).toMatchObject({ status: "idle", heard: "" });
  });

  it("sends what it heard if the browser stops by itself while the key is held", () => {
    const voice = setUp();
    voice.start();
    latest().hear("long pause after this");
    latest().end();
    expect(sent).toEqual(["long pause after this"]);
    expect(voice.state.get().status).toBe("idle");
    // Letting go afterwards changes nothing.
    voice.stop();
    expect(sent).toHaveLength(1);
  });

  it("drops the words if an error arrives while finishing", () => {
    const voice = setUp();
    voice.start();
    latest().hear("half heard");
    voice.stop();
    latest().fail("network");
    expect(sent).toEqual([]);
    expect(voice.state.get()).toMatchObject({ status: "idle", available: true });
    expect(voice.state.get().notice).not.toBeNull();
    vi.advanceTimersByTime(secondsToMs(Config.PlayerVoice.ResultWaitSeconds));
    expect(sent).toEqual([]);
  });

  it("doesn't listen outside the player's turn", () => {
    const voice = setUp();
    playerTurn = false;
    voice.start();
    expect(recognitions).toHaveLength(0);
    expect(voice.state.get().status).toBe("idle");
  });

  it("starts only one talk at a time", () => {
    const voice = setUp();
    voice.start();
    voice.start();
    expect(recognitions).toHaveLength(1);
  });

  it("sends what it heard if the browser never finishes", () => {
    const voice = setUp();
    voice.start();
    latest().hear("are you there");
    voice.stop();
    vi.advanceTimersByTime(secondsToMs(Config.PlayerVoice.ResultWaitSeconds));
    expect(sent).toEqual(["are you there"]);
    expect(latest().aborted).toBe(true);
    // A late end changes nothing.
    latest().end();
    expect(sent).toHaveLength(1);
  });

  it("lets go by itself after the longest talk", () => {
    const voice = setUp();
    voice.start();
    latest().hear("blah blah");
    vi.advanceTimersByTime(secondsToMs(Config.PlayerVoice.MaxTalkSeconds));
    expect(latest().stopped).toBe(true);
    expect(voice.state.get().status).toBe("finishing");
    latest().end();
    expect(sent).toEqual(["blah blah"]);
  });

  it("shortens a long ramble to the typed message limit", () => {
    const voice = setUp();
    voice.start();
    latest().hear("word ".repeat(100));
    voice.stop();
    latest().end();
    const [text] = sent;
    expect(text).toBeDefined();
    expect([...(text ?? "")].length).toBeLessThanOrEqual(Config.Call.MaxTypedMessageLength);
  });

  it("says it didn't catch anything instead of sending an empty message", () => {
    const voice = setUp();
    voice.start();
    voice.stop();
    latest().end();
    expect(sent).toEqual([]);
    expect(voice.state.get()).toMatchObject({ notice: NothingHeardNotice, available: true });
    vi.advanceTimersByTime(secondsToMs(Config.PlayerVoice.NoticeSeconds));
    expect(voice.state.get().notice).toBeNull();
  });

  it("drops the words if the turn moved on before they came back", () => {
    const voice = setUp();
    voice.start();
    latest().hear("too late");
    voice.stop();
    playerTurn = false;
    latest().end();
    expect(sent).toEqual([]);
  });

  it("drops a cancelled talk without sending or a notice", () => {
    const voice = setUp();
    voice.start();
    latest().hear("half a sentence");
    voice.cancel();
    expect(latest().aborted).toBe(true);
    latest().end();
    expect(sent).toEqual([]);
    expect(voice.state.get()).toMatchObject({ status: "idle", notice: null });
  });

  it("switches to typing for good when the mic is blocked", () => {
    const voice = setUp();
    voice.start();
    latest().fail("not-allowed");
    expect(sent).toEqual([]);
    expect(voice.state.get()).toMatchObject({ status: "idle", available: false });
    const notice = voice.state.get().notice;
    expect(notice).not.toBeNull();

    // Trying again doesn't ask for the mic again; it repeats why.
    voice.start();
    expect(recognitions).toHaveLength(1);
    expect(voice.state.get().notice).toBe(notice);
  });

  it("can try again after hearing nothing", () => {
    const voice = setUp();
    voice.start();
    latest().fail("no-speech");
    expect(voice.state.get()).toMatchObject({ available: true, notice: NothingHeardNotice });
    voice.start();
    expect(recognitions).toHaveLength(2);
  });

  it("says so when the browser has no speech recognition", () => {
    const voice = setUp(false);
    expect(voice.state.get().available).toBe(false);
    voice.start();
    expect(voice.state.get().notice).toBe(UnsupportedNotice);
  });

  it("recovers when the browser refuses to start", () => {
    const voice = setUp();
    refuseToStart = true;
    voice.start();
    refuseToStart = false;
    expect(voice.state.get()).toMatchObject({ status: "idle", available: true });
    expect(voice.state.get().notice).not.toBeNull();
    voice.start();
    expect(voice.state.get().status).toBe("listening");
  });

  it("clears its timers when disposed", () => {
    const voice = setUp();
    voice.start();
    voice.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
