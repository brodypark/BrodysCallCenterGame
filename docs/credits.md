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
- **Indian Music Meme**: `public/sounds/music/indian-music-meme.mp3`. A meme clip made with
  Voicemod ("indian-music-meme-original"). **License unconfirmed**: fine for local testing;
  confirm the rights (or replace it) before deploying.
- **Patapim**: `public/sounds/music/patapim.mp3`. A user-uploaded meme clip. **License unconfirmed**: fine for local testing; confirm the rights before deploying.

## Sounds

None: every sound effect (clicks, the ringtone, ka-ching, stamps, jingles...) is made in
code from tones and noise (`src/client/ui/synthSounds.ts`), so there's nothing to license.

To replace one with a recorded file, add `public/sounds/<name>.mp3`, list the name in
`SoundFiles` in `src/client/ui/sounds.ts`, and credit it here. The names are in
`src/client/ui/soundList.ts`.
