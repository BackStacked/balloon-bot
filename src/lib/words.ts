import { config } from "../config";
import type { ChatData, Trigger } from "../types";

/** Collapse whitespace so "good   morning" and "good morning" are the same word. */
export function cleanWord(word: string): string {
  return word.trim().replace(/\s+/g, " ");
}

/** Storage key for a word. */
export function wordKey(word: string): string {
  return cleanWord(word).toLowerCase();
}

/** Returns an error message, or null if the word is fine. */
export function validateWord(word: string): string | null {
  const w = cleanWord(word);
  if (!w) return "The word can't be empty.";
  if (w.startsWith("/")) return "The word can't start with <code>/</code> (that's a command).";
  if (Array.from(w).length > config.maxWordLength)
    return `The word is too long (max ${config.maxWordLength} characters).`;
  return null;
}

const WORD_CHAR = "[\\p{L}\\p{N}_]";
const regexCache = new Map<string, RegExp>();

function wholeWordRegex(needle: string): RegExp {
  let re = regexCache.get(needle);
  if (!re) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`, "u");
    if (regexCache.size > 5000) regexCache.clear();
    regexCache.set(needle, re);
  }
  return re;
}

/** Find the trigger that matches a message. Longer words win ("good morning" beats "good"). */
export function findTrigger(text: string, chat: ChatData): Trigger | undefined {
  const { matchMode, caseSensitive } = chat.settings;
  const hay = caseSensitive ? text : text.toLowerCase();
  const triggers = Object.values(chat.triggers).sort((a, b) => b.word.length - a.word.length);

  for (const t of triggers) {
    const needle = caseSensitive ? t.word : t.word.toLowerCase();
    switch (matchMode) {
      case "exact":
        if (cleanWord(hay) === needle) return t;
        break;
      case "contains":
        if (hay.includes(needle)) return t;
        break;
      default:
        if (wholeWordRegex(needle).test(hay)) return t;
    }
  }
  return undefined;
}
