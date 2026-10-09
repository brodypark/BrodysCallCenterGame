# Credits

Assets the game ships with, and their licenses.

## Fonts

- **Lilita One** by Juan Montoreano (title menu). SIL Open Font License 1.1; the license
  is in `public/fonts/LilitaOne-OFL.txt`. File: `public/fonts/LilitaOne-Latin.woff2`
  (the Latin subset from Google Fonts).

## Music

Looped background music, picked in the Settings app (`src/client/ui/songs.ts`).

- **Memememew**: `public/sounds/music/memememew.mp3`. A meme clip downloaded from Voicy
  ("Indian Memememew Memew"). **License unconfirmed**: fine for local testing; confirm the
  rights (or replace it) before deploying.
- **Skibidi Toilet**: `public/sounds/music/skibidi-toilet.mp3`. "Skibidi Toilet" by Lil Big
  Stack, downloaded from APLMate. **License unconfirmed**: confirm the rights (or replace it).
- **Patapim**: `public/sounds/music/patapim.mp3`. A user-uploaded meme clip. **License unconfirmed**: fine for local testing; confirm the rights before deploying.

## Intro video

- **Intro**: `public/videos/intro.mp4`, the opening cutscene that plays on New Game
  (`src/client/ui/introPlayer.ts`). Supplied by the game's author.

## Facecam

- **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision` 1.1.0) by Google. Apache License 2.0.
  The WebAssembly files in `public/facecam/wasm/` are copied from the npm package (keep them
  the same version as package.json), and `public/facecam/face_landmarker.task` is the float16
  model (version 1) from Google's MediaPipe model storage. It runs on the player's device; its
  usage logging to Google is blocked (`src/client/facecam/blockTrackerLogs.ts`).

## Sounds

Every sound effect (clicks, the ringtones, ka-ching, stamps, jingles...) is made in code from
tones and noise (`src/client/ui/synthSounds.ts`), so there's nothing to license, except:

- **Yo Phone Linging** ringtone: `public/sounds/ring-yo-phone.mp3`. A meme clip
  ("Yo Phone Linging Meme sound") supplied by the game's author. **License unconfirmed**:
  fine for local testing; confirm the rights (or replace it) before deploying.

To replace one with a recorded file, add `public/sounds/<name>.mp3`, list the name in
`SoundFiles` in `src/client/ui/sounds.ts`, and credit it here. The names are in
`src/client/ui/soundList.ts`.
