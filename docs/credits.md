# Credits

Assets the game ships with, and their licenses.

## Fonts

- **Lilita One** by Juan Montoreano (title menu). SIL Open Font License 1.1; the license
  is in `public/fonts/LilitaOne-OFL.txt`. File: `public/fonts/LilitaOne-Latin.woff2`
  (the Latin subset from Google Fonts).

## Music

Looped background music, picked from the ♪ menu in the taskbar (`src/client/ui/songs.ts`).

- **Memememew**: `public/sounds/music/memememew.mp3`. A meme clip downloaded from Voicy
  ("Indian Memememew Memew"). **License unconfirmed**: fine for local testing; confirm the
  rights (or replace it) before deploying.
- **Indian Music Meme**: `public/sounds/music/indian-music-meme.mp3`. A meme clip made with
  Voicemod ("indian-music-meme-original"). **License unconfirmed**: fine for local testing;
  confirm the rights (or replace it) before deploying.

## Sounds

None yet. The game plays these if they're in `public/sounds` (each `<name>.mp3`) and skips
any that are missing (`src/client/ui/sounds.ts`):

`click`, `window-open`, `window-close`, `ring` (loops), `pick-up`, `dial-tone`,
`message-sent`, `ka-ching`, `coins`, `wrong-code`, `suspicion-up`, `suspicion-down`,
`clock-in`, `overtime`, `stamp`, `promoted`, `fired`, `level-up`.

Credit each file here when it's added.
