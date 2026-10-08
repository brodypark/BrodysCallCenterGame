// Card code boxes show what's typed in capitals, like the codes callers read out. Changes the
// box's text in place so the cursor stays where it was, even when typing mid-code.

/** Uppercases the input's text, keeping the cursor, and returns the new text. */
export function upperCaseInput(input: HTMLInputElement): string {
  const { selectionStart, selectionEnd, selectionDirection } = input;
  const upper = input.value.toUpperCase();
  if (upper !== input.value) {
    input.value = upper;
    input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
  }
  return upper;
}
