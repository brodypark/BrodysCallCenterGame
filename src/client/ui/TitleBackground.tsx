// The title menu's background art: a city at dusk under a starry sky, with drifting clouds,
// a shooting star, lit office windows, the tech support tower's blinking rooftop sign, and
// speech bubbles floating up from the windows. Drawn in SVG (no image files) and laid out
// from a fixed seed, so it looks the same every visit. Purely decorative.

import type { CSSProperties, ReactElement } from "react";
import styles from "@client/ui/TitleBackground.module.css";

// The drawing's own units; it's scaled to cover the desktop, cropping the edges.
const Width = 1600;
const Height = 900;
// Where buildings stand.
const StreetY = 836;
const Seed = 20261007;

/** A small seeded random number generator (mulberry32), so the city never changes. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(Seed);
const between = (min: number, max: number): number => min + random() * (max - min);

interface Star {
  x: number;
  y: number;
  r: number;
  // Seconds, for the twinkle.
  delay: number;
  duration: number;
}

const Stars: readonly Star[] = Array.from({ length: 90 }, () => ({
  x: between(0, Width),
  y: between(0, Height * 0.55),
  r: between(0.8, 2.6),
  delay: between(0, 6),
  duration: between(2.5, 6),
}));

interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  windows: readonly { x: number; y: number; flicker: boolean }[];
}

interface SkylineOptions {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  windowWidth: number;
  windowHeight: number;
  litChance: number;
}

/** Buildings side by side across the whole width, each with some lit windows. */
function skyline(options: SkylineOptions): readonly Building[] {
  const buildings: Building[] = [];
  const columnGap = options.windowWidth * 1.4;
  const rowGap = options.windowHeight * 0.9;
  for (let x = -40; x < Width + 40;) {
    const width = Math.round(between(options.minWidth, options.maxWidth));
    const height = Math.round(between(options.minHeight, options.maxHeight));
    const y = StreetY - height;
    const windows: { x: number; y: number; flicker: boolean }[] = [];
    const columns = Math.floor((width - columnGap) / (options.windowWidth + columnGap));
    const rows = Math.floor((height - rowGap * 2) / (options.windowHeight + rowGap));
    const sideMargin = (width - columns * options.windowWidth - (columns - 1) * columnGap) / 2;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        if (random() < options.litChance) {
          windows.push({
            x: x + sideMargin + column * (options.windowWidth + columnGap),
            y: y + rowGap * 1.5 + row * (options.windowHeight + rowGap),
            flicker: random() < 0.06,
          });
        }
      }
    }
    buildings.push({ x, y, width, height, windows });
    x += width + Math.round(between(-6, 10));
  }
  return buildings;
}

const FarBuildings = skyline({
  minWidth: 60,
  maxWidth: 120,
  minHeight: 150,
  maxHeight: 300,
  windowWidth: 7,
  windowHeight: 10,
  litChance: 0.28,
});

const NearBuildings = skyline({
  minWidth: 90,
  maxWidth: 170,
  minHeight: 110,
  maxHeight: 230,
  windowWidth: 11,
  windowHeight: 15,
  litChance: 0.34,
});

// The tech support tower, on the left where the title doesn't cover it.
const Tower = { x: 150, width: 170, top: 360 };
const TowerWindows = Array.from({ length: 9 * 5 }, (_, index) => ({
  x: Tower.x + 22 + (index % 5) * 28,
  y: Tower.top + 70 + Math.floor(index / 5) * 42,
  lit: random() < 0.7,
}));

interface Cloud {
  // Where it rests when motion is reduced.
  x: number;
  y: number;
  scale: number;
  // Seconds to cross the sky, and how far through it starts.
  duration: number;
  delay: number;
}

const Clouds: readonly Cloud[] = [
  { x: 260, y: 120, scale: 1.3, duration: 170, delay: -40 },
  { x: 1380, y: 230, scale: 0.9, duration: 130, delay: -95 },
  { x: 700, y: 70, scale: 0.7, duration: 150, delay: -10 },
  { x: 1050, y: 310, scale: 1.1, duration: 190, delay: -150 },
];

// Street lamps along the front, by x.
const Lamps: readonly number[] = [90, 470, 850, 1230, 1560];

// Speech bubbles drifting up from windows: [x, y, text, delay seconds].
const Bubbles: readonly (readonly [number, number, string, number])[] = [
  [240, 520, "...", 0],
  [610, 640, "$$$", 2.6],
  [980, 610, "??", 5.1],
  [1240, 560, "...", 1.4],
  [1460, 650, "!", 3.8],
];

function CloudShape({ cloud }: { cloud: Cloud }): ReactElement {
  return (
    <g
      className={styles.cloud}
      style={
        {
          "--rest-x": `${cloud.x}px`,
          animationDuration: `${cloud.duration}s`,
          animationDelay: `${cloud.delay}s`,
        } as CSSProperties
      }
    >
      <g transform={`translate(0 ${cloud.y}) scale(${cloud.scale})`}>
        <ellipse cx="0" cy="20" rx="110" ry="26" />
        <ellipse cx="-40" cy="6" rx="48" ry="34" />
        <ellipse cx="18" cy="-4" rx="58" ry="42" />
        <ellipse cx="66" cy="10" rx="40" ry="28" />
      </g>
    </g>
  );
}

function BuildingShapes({
  buildings,
  className,
  windowWidth,
  windowHeight,
}: {
  buildings: readonly Building[];
  className: string | undefined;
  windowWidth: number;
  windowHeight: number;
}): ReactElement {
  return (
    <g>
      {buildings.map((building) => (
        <g key={building.x}>
          <rect
            className={className}
            x={building.x}
            y={building.y}
            width={building.width}
            height={building.height}
          />
          {building.windows.map((window) => (
            <rect
              key={`${window.x},${window.y}`}
              className={window.flicker ? styles.flicker : styles.window}
              x={window.x}
              y={window.y}
              width={windowWidth}
              height={windowHeight}
            />
          ))}
        </g>
      ))}
    </g>
  );
}

export function TitleBackground(): ReactElement {
  return (
    <svg
      className={styles.art}
      viewBox={`0 0 ${Width} ${Height}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="title-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1440" />
          <stop offset="0.42" stopColor="#262a7a" />
          <stop offset="0.7" stopColor="#6c3b93" />
          <stop offset="0.86" stopColor="#d9617a" />
          <stop offset="1" stopColor="#ffb06b" />
        </linearGradient>
        <radialGradient id="title-horizon" cx="0.5" cy="1" r="0.6">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="title-moon-glow">
          <stop offset="0.3" stopColor="#fff2c8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="title-shooting-star" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="title-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff7aa0" stopOpacity="0" />
          <stop offset="1" stopColor="#ff7aa0" stopOpacity="0.28" />
        </linearGradient>
        <radialGradient id="title-lamp-glow">
          <stop offset="0" stopColor="#ffe08a" stopOpacity="0.7" />
          <stop offset="1" stopColor="#ffe08a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="title-street" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0f33" />
          <stop offset="1" stopColor="#07040f" />
        </linearGradient>
      </defs>

      <rect width={Width} height={Height} fill="url(#title-sky)" />
      <ellipse
        cx={Width / 2}
        cy={Height}
        rx={Width * 0.7}
        ry={Height * 0.5}
        fill="url(#title-horizon)"
      />

      {Stars.map((star) => (
        <circle
          key={`${star.x},${star.y}`}
          className={styles.star}
          cx={star.x}
          cy={star.y}
          r={star.r}
          style={{ animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s` }}
        />
      ))}

      <g className={styles.shootingStar}>
        <line
          x1="0"
          y1="0"
          x2="150"
          y2="50"
          stroke="url(#title-shooting-star)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      <circle cx="1330" cy="150" r="140" fill="url(#title-moon-glow)" />
      <circle cx="1330" cy="150" r="52" fill="#fff4d6" />
      <circle cx="1312" cy="138" r="10" fill="#efe0b8" />
      <circle cx="1348" cy="168" r="7" fill="#efe0b8" />
      <circle cx="1342" cy="128" r="4" fill="#efe0b8" />

      {Clouds.map((cloud) => (
        <CloudShape key={cloud.y} cloud={cloud} />
      ))}

      <BuildingShapes
        buildings={FarBuildings}
        className={styles.far}
        windowWidth={7}
        windowHeight={10}
      />

      {/* Haze between the far and near buildings, for depth. */}
      <rect y="520" width={Width} height={StreetY - 520} fill="url(#title-haze)" />

      {/* The tech support tower, with its antenna and rooftop sign. */}
      <g>
        <rect
          className={styles.towerBody}
          x={Tower.x}
          y={Tower.top}
          width={Tower.width}
          height={StreetY - Tower.top}
        />
        <rect
          className={styles.towerBody}
          x={Tower.x + 20}
          y={Tower.top - 30}
          width={Tower.width - 40}
          height="30"
        />
        <rect
          className={styles.towerBody}
          x={Tower.x + Tower.width / 2 - 3}
          y={Tower.top - 130}
          width="6"
          height="100"
        />
        <circle
          className={styles.beacon}
          cx={Tower.x + Tower.width / 2}
          cy={Tower.top - 134}
          r="7"
        />
        {TowerWindows.map((window) => (
          <rect
            key={`${window.x},${window.y}`}
            className={window.lit ? styles.towerWindow : styles.towerWindowDark}
            x={window.x}
            y={window.y}
            width="16"
            height="24"
          />
        ))}
        <g className={styles.neon}>
          <rect
            x={Tower.x - 18}
            y={Tower.top - 26}
            width={Tower.width + 36}
            height="54"
            rx="10"
            className={styles.neonBox}
          />
          <text
            x={Tower.x + Tower.width / 2}
            y={Tower.top + 12}
            className={styles.neonText}
            textAnchor="middle"
          >
            24/7 HELP
          </text>
        </g>
      </g>

      <BuildingShapes
        buildings={NearBuildings}
        className={styles.near}
        windowWidth={11}
        windowHeight={15}
      />

      {Bubbles.map(([x, y, text, delay]) => (
        <g key={`${x},${y}`} className={styles.bubble} style={{ animationDelay: `${delay}s` }}>
          <g transform={`translate(${x} ${y})`}>
            <rect x="-30" y="-22" width="60" height="38" rx="14" />
            <path d="M -10 15 L -18 28 L 2 15 Z" />
            <text y="6" textAnchor="middle">
              {text}
            </text>
          </g>
        </g>
      ))}

      <rect y={StreetY} width={Width} height={Height - StreetY} fill="url(#title-street)" />

      {Lamps.map((x) => (
        <g key={x}>
          <circle cx={x} cy="772" r="70" fill="url(#title-lamp-glow)" />
          <rect className={styles.lampPost} x={x - 3} y="772" width="6" height={Height - 772} />
          <rect className={styles.lampPost} x={x - 14} y="766" width="28" height="8" rx="3" />
          <circle className={styles.lampBulb} cx={x} cy="779" r="6" />
        </g>
      ))}
    </svg>
  );
}
