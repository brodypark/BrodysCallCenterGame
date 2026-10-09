// How much of a victim line has been said so far, letter by letter, so its subtitle types
// itself out as they speak. Speech time roughly follows length, so each letter shows the
// moment its share of the line is reached.

export interface SpokenSplit {
  // The letters said so far.
  said: string;
  // The rest of the line, still to come.
  unsaid: string;
}

/** Splits `text` at the point `fraction` (0 to 1) of the way through saying it. */
export function splitSpoken(text: string, fraction: number): SpokenSplit {
  // Counted in code points, not UTF-16 units, so a simple emoji never shows half drawn.
  const letters = [...text];
  const shown = Math.ceil(Math.min(1, Math.max(0, fraction)) * letters.length);
  return { said: letters.slice(0, shown).join(""), unsaid: letters.slice(shown).join("") };
}
