// The game's sound effects, made from tones and noise in code rather than recorded files,
// so there's nothing to license: a soft click, a classic double ring (plus the Shop's
// chiptune, airhorn and dial-up modem ringtones), a cash register, a buzzer, a stamp thud,
// fanfares and a sad trombone. Cartoonish and retro, like the rest of
// the desktop, and a glitchy meltdown for getting hacked. Plain functions that return
// samples (-1 to 1), so they're tested without a browser; ui/sounds turns them into audio.

import type { SoundName } from "@client/ui/soundList";

type Wave = "sine" | "square" | "triangle";

// Every sound is scaled so its loudest sample is this, leaving a little headroom.
const Peak = 0.9;
// Fades in and out over this long, so notes start and stop without a pop.
const EdgeSeconds = 0.004;

interface ToneOptions {
  // Hz at the start, and at the end if it slides.
  from: number;
  to?: number;
  wave?: Wave;
  // How fast it dies away (per second); 0 holds steady.
  decay?: number;
  volume?: number;
  // Wobbles the pitch: [how many times a second, how far as a fraction of the pitch].
  vibrato?: [number, number];
}

/** One cycle of `wave` at `phase` (in cycles). */
function waveAt(wave: Wave, phase: number): number {
  const cycle = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(cycle * 2 * Math.PI);
    case "square":
      // A little softer than a pure square, which is harsh.
      return Math.tanh(Math.sin(cycle * 2 * Math.PI) * 4);
    case "triangle":
      return 1 - 4 * Math.abs(cycle - 0.5);
  }
}

/** Builds a sound by mixing timed pieces into one track. */
class Track {
  private readonly samples: number[] = [];
  constructor(private readonly rate: number) {}

  /** Mixes `length` seconds of `sample(t)` (t from 0, in seconds) in at `at` seconds. */
  add(at: number, length: number, sample: (t: number) => number): this {
    const start = Math.round(at * this.rate);
    const count = Math.round(length * this.rate);
    for (let index = 0; index < count; index += 1) {
      const t = index / this.rate;
      const edge = Math.min(1, t / EdgeSeconds, (length - t) / EdgeSeconds);
      const position = start + index;
      this.samples[position] = (this.samples[position] ?? 0) + sample(t) * edge;
    }
    return this;
  }

  /** A note (or a slide between two pitches). */
  tone(at: number, length: number, options: ToneOptions): this {
    const { from, to = from, wave = "sine", decay = 0, volume = 1, vibrato } = options;
    return this.add(at, length, (t) => {
      // The phase of a pitch sliding evenly from `from` to `to`.
      let phase = from * t + ((to - from) * t * t) / (2 * length);
      if (vibrato) {
        const [speed, depth] = vibrato;
        phase += (((from * depth) / speed) * Math.sin(2 * Math.PI * speed * t)) / (2 * Math.PI);
      }
      return waveAt(wave, phase) * volume * Math.exp(-decay * t);
    });
  }

  /** A burst of noise with nothing much above `cutoff` Hz (lower is duller). */
  noise(at: number, length: number, decay: number, cutoff: number, volume = 1): this {
    // The same every time, so sounds (and tests) are repeatable.
    let seed = 1;
    let filtered = 0;
    // A simple low-pass filter, worked out from the rate so it sounds the same on any device.
    const smoothing = 1 - Math.exp((-2 * Math.PI * cutoff) / this.rate);
    return this.add(at, length, (t) => {
      seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0;
      const white = (seed / 2 ** 32) * 2 - 1;
      filtered += smoothing * (white - filtered);
      return filtered * volume * Math.exp(-decay * t);
    });
  }

  /** The mixed sound, scaled to Peak. */
  done(): Float32Array<ArrayBuffer> {
    const output = Float32Array.from(this.samples, (sample) => sample || 0);
    let loudest = 0;
    for (const sample of output) {
      loudest = Math.max(loudest, Math.abs(sample));
    }
    if (loudest > 0) {
      for (let index = 0; index < output.length; index += 1) {
        output[index] = ((output[index] ?? 0) / loudest) * Peak;
      }
    }
    return output;
  }
}

// Note pitches (Hz).
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;
const G4 = 392;
const Bb4 = 466.16;
const A5 = 880;
const B5 = 987.77;
const D5 = 587.33;
const F5 = 698.46;
const D6 = 1174.66;
const C4 = 261.63;
const F4 = 349.23;

// The Shop's ringtones loop like the classic ring: each ends with silence until this long.
const ChiptuneLoopSeconds = 2.4;
const AirhornLoopSeconds = 2.6;
const DialUpLoopSeconds = 3.2;
// Telephone keypad tones: [low, high] Hz for the digits the modem dials.
const DialDigits: readonly [number, number][] = [
  [697, 1209],
  [852, 1336],
  [770, 1477],
  [941, 1336],
  [697, 1336],
  [852, 1477],
];

/** Notes one after another, each `length` seconds. */
function arpeggio(
  track: Track,
  notes: number[],
  length: number,
  options: Omit<ToneOptions, "from">,
): Track {
  notes.forEach((note, index) =>
    track.tone(index * length, length * 1.6, { ...options, from: note }),
  );
  return track;
}

/** An old phone's bell: two trilling bursts, then a pause. Loops. */
function classicRing(rate: number): Float32Array<ArrayBuffer> {
  const track = new Track(rate);
  const trill = 22;
  for (const at of [0, 0.6]) {
    track.add(at, 0.4, (t) => {
      // The bell's hammer, smoothed so it warbles rather than rasps.
      const flutter = 0.675 + 0.325 * Math.sin(2 * Math.PI * trill * t);
      return (Math.sin(2 * Math.PI * 1150 * t) + 0.8 * Math.sin(2 * Math.PI * 1420 * t)) * flutter;
    });
  }
  // Silence to the end of the loop.
  track.add(0, 3, () => 0);
  return track.done();
}

const Makers: Record<SoundName, (rate: number) => Float32Array<ArrayBuffer>> = {
  // A satisfying, crisp mechanical click.
  click: (rate) =>
    new Track(rate)
      .noise(0, 0.01, 80, 8000, 0.4)
      .tone(0, 0.02, { from: 800, to: 100, wave: "triangle", decay: 100 })
      .done(),
  "window-open": (rate) =>
    arpeggio(new Track(rate), [660, 990], 0.05, { wave: "triangle", decay: 30 }).done(),
  "window-close": (rate) =>
    arpeggio(new Track(rate), [990, 660], 0.05, { wave: "triangle", decay: 30 }).done(),
  ring: classicRing,
  // A recorded clip (public/sounds/ring-yo-phone.mp3); the classic bell if it won't load.
  "ring-yo-phone": classicRing,
  // A bouncy 8-bit tune: two climbing square-wave phrases over a triangle bass. Loops.
  "ring-chiptune": (rate) => {
    const track = new Track(rate);
    const step = 0.09;
    const melody = [C5, G5, E5, G5, C6, G5, E6, C6, D5, A5, F5, A5, D6, B5, G5, B5];
    melody.forEach((note, index) =>
      track.tone(index * step, step * 0.9, { from: note, wave: "square", volume: 0.5 }),
    );
    [C4, C4, F4, G4 / 2].forEach((note, index) =>
      track.tone(index * step * 4, step * 3.6, { from: note, wave: "triangle", volume: 0.7 }),
    );
    track.add(0, ChiptuneLoopSeconds, () => 0);
    return track.done();
  },
  // A stadium airhorn: BWAMP, BWAMP, BWAAAAAMP. Each blast scoops up into a sour chord.
  "ring-airhorn": (rate) => {
    const track = new Track(rate);
    const blasts: [number, number][] = [
      [0, 0.18],
      [0.26, 0.18],
      [0.52, 0.85],
    ];
    for (const [at, length] of blasts) {
      for (const pitch of [Bb4, D5, F5]) {
        track.tone(at, length, {
          from: pitch * 0.9,
          to: pitch,
          wave: "square",
          volume: 0.4,
          vibrato: [30, 0.006],
        });
      }
      track.noise(at, length, 2, 3000, 0.25);
    }
    track.add(0, AirhornLoopSeconds, () => 0);
    return track.done();
  },
  // An old modem connecting: dialing, the answer tone, bongs, then screeching static. Loops.
  "ring-dial-up": (rate) => {
    const track = new Track(rate);
    DialDigits.forEach(([low, high], index) => {
      track.tone(index * 0.11, 0.08, { from: low, volume: 0.5 });
      track.tone(index * 0.11, 0.08, { from: high, volume: 0.5 });
    });
    track.tone(0.8, 0.3, { from: 2100, volume: 0.6 });
    [1200, 2400, 1200, 2400].forEach((pitch, index) =>
      track.tone(1.15 + index * 0.08, 0.08, { from: pitch, decay: 6, volume: 0.6 }),
    );
    return track
      .tone(1.5, 0.8, { from: 1800, to: 1650, wave: "square", volume: 0.35, vibrato: [45, 0.08] })
      .tone(1.5, 0.8, { from: 980, wave: "triangle", volume: 0.3 })
      .noise(1.5, 0.8, 0, 7000, 0.5)
      .noise(2.3, 0.35, 4, 4000, 0.6)
      .add(0, DialUpLoopSeconds, () => 0)
      .done();
  },
  // The handset coming off the hook: a clunk (a knock small speakers can play, over a thump).
  "pick-up": (rate) =>
    new Track(rate)
      .noise(0, 0.08, 40, 1200)
      .tone(0, 0.06, { from: 520, to: 300, decay: 45, volume: 0.6 })
      .tone(0, 0.1, { from: 180, to: 110, decay: 30, volume: 0.4 })
      .done(),
  // The line going dead: a busy signal.
  "dial-tone": (rate) => {
    const track = new Track(rate);
    for (let beep = 0; beep < 5; beep += 1) {
      track.tone(beep * 0.5, 0.25, { from: 480, volume: 0.5 });
      track.tone(beep * 0.5, 0.25, { from: 620, volume: 0.5 });
    }
    return track.done();
  },
  "message-sent": (rate) =>
    new Track(rate).tone(0, 0.09, { from: 600, to: 1200, wave: "triangle", decay: 20 }).done(),
  // The drawer, then the bell.
  "ka-ching": (rate) => {
    const track = new Track(rate).noise(0, 0.05, 50, 8500, 0.6);
    for (const [pitch, volume] of [
      [2093, 1],
      [2637, 0.7],
      [3136, 0.5],
    ] as const) {
      track.tone(0.06, 0.7, { from: pitch, decay: 6, volume });
    }
    return track.done();
  },
  // A handful of coins landing.
  coins: (rate) => {
    const track = new Track(rate);
    const drops: [number, number][] = [
      [0, 3100],
      [0.07, 2600],
      [0.12, 3500],
      [0.2, 2900],
      [0.27, 3800],
      [0.36, 3300],
    ];
    for (const [at, pitch] of drops) {
      track.tone(at, 0.15, { from: pitch, decay: 30, volume: 0.6 });
    }
    return track.done();
  },
  // A short double buzz.
  "wrong-code": (rate) =>
    new Track(rate)
      .tone(0, 0.16, { from: 140, wave: "square", volume: 0.7 })
      .tone(0.2, 0.22, { from: 120, wave: "square", volume: 0.7 })
      .done(),
  // Uh-oh: two notes down.
  "suspicion-up": (rate) =>
    arpeggio(new Track(rate), [440, 330], 0.11, { wave: "square", decay: 8, volume: 0.6 }).done(),
  // Ooh: two notes up.
  "suspicion-down": (rate) =>
    arpeggio(new Track(rate), [C5, G5], 0.1, { wave: "triangle", decay: 8 }).done(),
  "clock-in": (rate) =>
    arpeggio(new Track(rate), [C5, E5, G5, C6], 0.08, { wave: "triangle", decay: 10 }).done(),
  // An alarm: high, low, high, low.
  overtime: (rate) => {
    const track = new Track(rate);
    // Held notes, each ending as the next starts (an arpeggio's overlap would smear them).
    [880, 660, 880, 660, 880, 660].forEach((pitch, index) =>
      track.tone(index * 0.16, 0.16, { from: pitch, wave: "square" }),
    );
    return track.done();
  },
  // A rubber stamp hitting the desk.
  stamp: (rate) =>
    new Track(rate)
      .noise(0, 0.12, 35, 750)
      .tone(0, 0.05, { from: 400, to: 200, decay: 50, volume: 0.5 })
      .tone(0, 0.18, { from: 120, to: 60, decay: 18, volume: 0.5 })
      .done(),
  // Ta-da!
  promoted: (rate) => {
    const track = arpeggio(new Track(rate), [G4, C5, E5], 0.11, { wave: "triangle", decay: 4 });
    return track
      .tone(0.33, 0.6, { from: G5, wave: "triangle", decay: 3, vibrato: [6, 0.01] })
      .done();
  },
  // Wah, wah, wah, wahhh.
  fired: (rate) => {
    const track = new Track(rate);
    [392, 370, 349].forEach((pitch, index) =>
      track.tone(index * 0.32, 0.28, { from: pitch, wave: "triangle", decay: 3 }),
    );
    return track
      .tone(0.96, 0.9, { from: 330, to: 320, wave: "triangle", decay: 2, vibrato: [5, 0.02] })
      .done();
  },
  "level-up": (rate) =>
    arpeggio(new Track(rate), [C5, E5, G5, C6, E6], 0.06, {
      wave: "square",
      decay: 10,
      volume: 0.5,
    })
      .tone(0.3, 0.4, { from: C6 * 2, decay: 8, volume: 0.3 })
      .done(),
  // A bright two-note chime: you've got mail.
  "new-mail": (rate) =>
    arpeggio(new Track(rate), [G5, E6], 0.12, { wave: "sine", decay: 9 }).done(),
  // Hacked: stuttering bleeps and bursts of static, then the computer powering down.
  hacked: (rate) => {
    const track = new Track(rate);
    [1760, 220, 1320, 330, 1980, 247].forEach((pitch, index) => {
      track.tone(index * 0.09, 0.06, { from: pitch, wave: "square", volume: 0.5 });
      track.noise(index * 0.09 + 0.05, 0.04, 20, 6000, 0.6);
    });
    return track
      .tone(0.6, 1.2, { from: 880, to: 55, wave: "square", decay: 1.5, vibrato: [14, 0.04] })
      .noise(0.6, 1.2, 2, 2500, 0.3)
      .done();
  },
};

/** The samples for `name` at `rate` samples a second. */
export function synthesize(name: SoundName, rate: number): Float32Array<ArrayBuffer> {
  return Makers[name](rate);
}
