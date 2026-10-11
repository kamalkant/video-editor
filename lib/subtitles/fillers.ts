/**
 * Pure hesitation sounds only (um, umm, uh, uhm, er, erm, ah, hmm, mm). Real words such as
 * "like", "so" or "actually" are never marked: cutting them changes what the speaker means.
 */
export const FILLER_RE = /^(u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m{2,})$/i;

/** Whether a transcript word (punctuation allowed around it) is a hesitation sound. */
export function isFillerWord(word: string): boolean {
  return FILLER_RE.test(word.replace(/[^\p{L}\p{N}']/gu, ""));
}
