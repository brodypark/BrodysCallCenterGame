// The background music the player can pick from. Each file is in public/sounds/music and
// loops. Adding a song is one entry here (and a line in docs/credits.md).

export interface Song {
  id: string;
  title: string;
  // Under public/.
  file: string;
}

export const Songs: readonly Song[] = [
  { id: "memememew", title: "Memememew", file: "sounds/music/memememew.mp3" },
  {
    id: "skibidi-toilet",
    title: "Skibidi Toilet",
    file: "sounds/music/skibidi-toilet.mp3",
  },
  {
    id: "patapim",
    title: "Patapim",
    file: "sounds/music/patapim.mp3",
  },
];

/** The song with `id`, or undefined if there isn't one (e.g. it was removed). */
export function findSong(id: string | null): Song | undefined {
  return Songs.find((song) => song.id === id);
}
