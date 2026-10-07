/** Joins CSS class names, skipping any that are missing or switched off. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
