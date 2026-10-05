import type { MessageEntity } from "grammy/types";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function tagsFor(e: MessageEntity): [open: string, close: string] | null {
  switch (e.type) {
    case "bold":
      return ["<b>", "</b>"];
    case "italic":
      return ["<i>", "</i>"];
    case "underline":
      return ["<u>", "</u>"];
    case "strikethrough":
      return ["<s>", "</s>"];
    case "spoiler":
      return ["<tg-spoiler>", "</tg-spoiler>"];
    case "code":
      return ["<code>", "</code>"];
    case "pre":
      return e.language
        ? [`<pre><code class="language-${escapeAttr(e.language)}">`, "</code></pre>"]
        : ["<pre>", "</pre>"];
    case "text_link":
      return [`<a href="${escapeAttr(e.url)}">`, "</a>"];
    case "text_mention":
      return [`<a href="tg://user?id=${e.user.id}">`, "</a>"];
    case "custom_emoji":
      return [`<tg-emoji emoji-id="${escapeAttr(e.custom_emoji_id)}">`, "</tg-emoji>"];
    case "blockquote":
      return ["<blockquote>", "</blockquote>"];
    case "expandable_blockquote":
      return ["<blockquote expandable>", "</blockquote>"];
    default:
      // mentions, hashtags, urls, etc. are re-detected by Telegram automatically
      return null;
  }
}

/**
 * Convert a message's text + entities into Telegram HTML so the formatting
 * (bold, links, spoilers, custom emoji...) is kept when Balloon re-sends it.
 */
export function entitiesToHtml(text: string, entities: MessageEntity[] = []): string {
  const spans = entities
    .map((e, i) => ({ tags: tagsFor(e), start: e.offset, end: e.offset + e.length, i }))
    .filter((s): s is typeof s & { tags: [string, string] } => s.tags !== null && s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.i - b.i);

  const points = [...new Set([0, text.length, ...spans.flatMap((s) => [s.start, s.end])])]
    .filter((p) => p >= 0 && p <= text.length)
    .sort((a, b) => a - b);

  let out = "";
  const open: typeof spans = [];
  let next = 0;
  for (let p = 0; p < points.length; p++) {
    const at = points[p];
    while (open.length && open[open.length - 1].end <= at) out += open.pop()!.tags[1];
    while (next < spans.length && spans[next].start === at) {
      out += spans[next].tags[0];
      open.push(spans[next++]);
    }
    if (p + 1 < points.length) out += escapeHtml(text.slice(at, points[p + 1]));
  }
  while (open.length) out += open.pop()!.tags[1];
  return out;
}

/** Strip tags to get a plain-text preview of stored HTML. */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** Truncate by characters (not UTF-16 units) so emoji aren't cut in half. */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max - 1).join("") + "…";
}

/** Split lines into Telegram-sized messages (limit is 4096 chars). */
export function chunkLines(header: string, lines: string[], max = 4000): string[] {
  const chunks: string[] = [];
  let current = header;
  for (const line of lines) {
    if (current.length + line.length + 1 > max && current !== header) {
      chunks.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current) chunks.push(current);
  return chunks;
}
