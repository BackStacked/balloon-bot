import { Composer, InlineKeyboard, InputFile, type Context } from "grammy";
import { config } from "../config";
import { store } from "../storage";
import { REPLY_TYPES, type Trigger, type TriggerReply } from "../types";
import { chunkLines, escapeHtml } from "../lib/html";
import { describeReply, PLACEHOLDERS, sendTriggerReply } from "../lib/reply";
import { endSession, sessionKey, startSession, type SetupSession } from "../lib/session";
import { adminGuard, autoDelete, deleteMany, isAdmin } from "../lib/telegram";
import { cleanWord, validateWord, wordKey } from "../lib/words";

export const words = new Composer<Context>();

/** Ask the admin a question as a forced reply, and remember it for cleanup. */
export async function ask(ctx: Context, session: SetupSession, html: string, placeholder: string) {
  const m = await ctx.reply(html, {
    parse_mode: "HTML",
    reply_parameters: { message_id: ctx.msg!.message_id, allow_sending_without_reply: true },
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: placeholder },
  });
  session.messageIds.push(m.message_id);
}

export const WORD_PROMPT = "🎈 <b>New trigger</b>\n\nSend me the <b>trigger word</b>.\n<i>Send /cancel to stop.</i>";

export function messagePrompt(word: string, exists: boolean): string {
  return [
    `✏️ Now send the <b>message</b> for <code>${escapeHtml(word)}</code>`,
    exists ? "\n⚠️ <i>This word already exists — its message will be replaced.</i>" : "",
    "\nSend <b>anything</b>: text (with formatting), photo, video, GIF, sticker, file/document, audio, voice, video note, location, contact, poll or dice.",
    `Placeholders: ${PLACEHOLDERS.map((p) => `<code>{${p}}</code>`).join(" ")}`,
    "<i>Send /cancel to stop.</i>",
  ].join("\n");
}

// /setword            → asks for the word, then the message
// /setword <word>     → skips straight to the message
words.command("setword", adminGuard, async (ctx) => {
  const session = startSession(ctx);
  const arg = ctx.match.trim();
  if (!arg) return ask(ctx, session, WORD_PROMPT, "Trigger word");

  const error = validateWord(arg);
  if (error) return ask(ctx, session, `❌ ${error}\n\n${WORD_PROMPT}`, "Trigger word");

  session.word = cleanWord(arg);
  session.step = "message";
  const exists = !!store.peek(ctx.chat.id)?.triggers[wordKey(arg)];
  await ask(ctx, session, messagePrompt(session.word, exists), "Reply message");
});

words.command("cancel", async (ctx) => {
  if (ctx.chat.type === "private") return;
  const session = endSession(sessionKey(ctx));
  if (!session) {
    const m = await ctx.reply("Nothing to cancel.");
    autoDelete(ctx.api, m.chat.id, m.message_id, 5);
    return;
  }
  await deleteMany(ctx.api, ctx.chat.id, [...session.messageIds, ctx.msg.message_id]);
  const m = await ctx.reply("❎ Setup cancelled.");
  autoDelete(ctx.api, m.chat.id, m.message_id, 5);
});

words.command(["listwords", "words", "list"], adminGuard, async (ctx) => {
  const list = Object.values(store.peek(ctx.chat.id)?.triggers ?? {}).sort((a, b) =>
    a.word.localeCompare(b.word),
  );
  if (!list.length) return ctx.reply("📭 No trigger words yet. Use /setword to add one.");

  const header = `🎈 <b>Trigger words</b> (${list.length})\n\n`;
  const lines = list.map((t, i) => `<b>${i + 1}.</b> <code>${escapeHtml(t.word)}</code> → ${describeReply(t.reply)}`);
  for (const chunk of chunkLines(header, lines)) {
    await ctx.reply(chunk, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  }
});

words.command(["getword", "preview"], adminGuard, async (ctx) => {
  const word = ctx.match.trim();
  if (!word) return ctx.reply("Usage: <code>/getword hello</code>", { parse_mode: "HTML" });
  const trigger = store.peek(ctx.chat.id)?.triggers[wordKey(word)];
  if (!trigger) return notFound(ctx, word);
  await sendTriggerReply(ctx.api, ctx.msg, trigger, { user: ctx.from, replyTo: true });
});

words.command(["removeword", "delword", "rmword"], adminGuard, async (ctx) => {
  const word = ctx.match.trim();
  if (!word) return ctx.reply("Usage: <code>/removeword hello</code>", { parse_mode: "HTML" });
  const chat = store.peek(ctx.chat.id);
  const key = wordKey(word);
  const trigger = chat?.triggers[key];
  if (!chat || !trigger) return notFound(ctx, word);
  delete chat.triggers[key];
  store.save();
  await ctx.reply(`🗑 Removed <code>${escapeHtml(trigger.word)}</code>.`, { parse_mode: "HTML" });
});

words.command(["removeall", "clearwords", "deleteall"], adminGuard, async (ctx) => {
  const count = Object.keys(store.peek(ctx.chat.id)?.triggers ?? {}).length;
  if (!count) return ctx.reply("📭 There are no trigger words to remove.");
  await ctx.reply(`⚠️ Delete <b>all ${count}</b> trigger words in this group?\nThis can't be undone.`, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard().text("🗑 Yes, delete all", "rmall:yes").text("Cancel", "rmall:no"),
  });
});

words.callbackQuery(/^rmall:(yes|no)$/, async (ctx) => {
  if (!(await isAdmin(ctx))) {
    return ctx.answerCallbackQuery({ text: "Only admins can do this.", show_alert: true });
  }
  if (ctx.callbackQuery.data === "rmall:no") {
    await ctx.editMessageText("❎ Cancelled — nothing was deleted.");
    return ctx.answerCallbackQuery();
  }
  const chat = store.peek(ctx.chat!.id);
  const count = Object.keys(chat?.triggers ?? {}).length;
  if (chat) {
    chat.triggers = {};
    store.save();
  }
  await ctx.editMessageText(`🗑 Removed all ${count} trigger words.`);
  await ctx.answerCallbackQuery({ text: "Done" });
});

words.command("stats", adminGuard, async (ctx) => {
  const list = Object.values(store.peek(ctx.chat.id)?.triggers ?? {});
  if (!list.length) return ctx.reply("📭 No trigger words yet. Use /setword to add one.");
  const total = list.reduce((sum, t) => sum + t.hits, 0);
  const top = [...list].sort((a, b) => b.hits - a.hits).slice(0, 10);
  const lines = top.map((t, i) => `${i + 1}. <code>${escapeHtml(t.word)}</code> — ${t.hits}×`);
  await ctx.reply(
    `📊 <b>Balloon stats</b>\n\nWords: <b>${list.length}</b>\nTotal replies sent: <b>${total}</b>\n\n<b>Top words</b>\n${lines.join("\n")}`,
    { parse_mode: "HTML" },
  );
});

interface Backup {
  app: "balloon";
  version: 1;
  triggers: { word: string; reply: TriggerReply }[];
}

words.command("export", adminGuard, async (ctx) => {
  const list = Object.values(store.peek(ctx.chat.id)?.triggers ?? {});
  if (!list.length) return ctx.reply("📭 Nothing to export yet.");
  const backup: Backup = { app: "balloon", version: 1, triggers: list.map(({ word, reply }) => ({ word, reply })) };
  const file = new InputFile(Buffer.from(JSON.stringify(backup, null, 2)), `balloon-words-${Math.abs(ctx.chat.id)}.json`);
  await ctx.replyWithDocument(file, {
    caption: `🎈 ${list.length} trigger words exported.\nReply to this file with /import to restore them in any group.`,
  });
});

words.command("import", adminGuard, async (ctx) => {
  const doc = ctx.msg.reply_to_message?.document;
  if (!doc) return ctx.reply("📥 Reply to a Balloon backup file (from /export) with /import.");
  if ((doc.file_size ?? 0) > 2_000_000) return ctx.reply("❌ That file is too big to be a Balloon backup.");

  const file = await ctx.api.getFile(doc.file_id);
  const res = await fetch(`https://api.telegram.org/file/bot${config.token}/${file.file_path}`);
  if (!res.ok) return ctx.reply("❌ Couldn't download that file. Please try again.");

  let items: Backup["triggers"] | null = null;
  try {
    items = parseBackup(JSON.parse(await res.text()));
  } catch {
    // fall through to the error below
  }
  if (!items) return ctx.reply("❌ That isn't a valid Balloon backup file.");

  const chat = store.chat(ctx.chat.id);
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  for (const { word, reply } of items) {
    const key = wordKey(word);
    const existing = chat.triggers[key];
    if (!existing && Object.keys(chat.triggers).length >= config.maxTriggersPerChat) {
      skipped++;
      continue;
    }
    chat.triggers[key] = {
      word: cleanWord(word),
      reply,
      createdBy: ctx.from?.id ?? 0,
      createdAt: Date.now(),
      hits: existing?.hits ?? 0,
    };
    existing ? replaced++ : added++;
  }
  store.save();
  await ctx.reply(
    `📥 Import done: <b>${added}</b> added, <b>${replaced}</b> replaced${skipped ? `, <b>${skipped}</b> skipped (limit ${config.maxTriggersPerChat})` : ""}.`,
    { parse_mode: "HTML" },
  );
});

const EXTRA_TYPES = ["location", "venue", "contact", "dice", "poll"] as const;

function parseBackup(data: unknown): Backup["triggers"] | null {
  if (!data || typeof data !== "object" || !Array.isArray((data as Backup).triggers)) return null;
  const out: Backup["triggers"] = [];
  for (const item of (data as Backup).triggers) {
    const r = item?.reply;
    if (typeof item?.word !== "string" || validateWord(item.word)) continue;
    if (!r || !REPLY_TYPES.includes(r.type)) continue;
    if (r.text !== undefined && typeof r.text !== "string") continue;
    const needsExtra = (EXTRA_TYPES as readonly string[]).includes(r.type);
    if (r.type === "text" && !r.text) continue;
    if (needsExtra ? !r.extra || typeof r.extra !== "object" : r.type !== "text" && typeof r.fileId !== "string")
      continue;
    out.push({
      word: item.word,
      reply: { type: r.type, text: r.text, fileId: r.fileId, spoiler: r.spoiler === true || undefined, extra: r.extra },
    });
  }
  return out;
}

function notFound(ctx: Context, word: string) {
  return ctx.reply(`❌ No trigger word <code>${escapeHtml(cleanWord(word))}</code>. See /listwords.`, {
    parse_mode: "HTML",
  });
}

/** Save a trigger from a finished /setword session. Returns false if the chat is full. */
export function saveTrigger(chatId: number, title: string | undefined, trigger: Omit<Trigger, "hits">) {
  const chat = store.chat(chatId);
  const key = wordKey(trigger.word);
  const existing = chat.triggers[key];
  if (!existing && Object.keys(chat.triggers).length >= config.maxTriggersPerChat) return null;
  chat.title = title;
  chat.triggers[key] = { ...trigger, hits: existing?.hits ?? 0 };
  store.save();
  return { replaced: !!existing, total: Object.keys(chat.triggers).length };
}
