import { Composer, type Context } from "grammy";
import { config } from "../config";
import { store } from "../storage";
import { ask, messagePrompt, saveTrigger, WORD_PROMPT } from "../commands/words";
import { escapeHtml } from "../lib/html";
import { extractReply } from "../lib/reply";
import { endSession, getSession, sessionKey, touchSession } from "../lib/session";
import { deleteMany, isCommand } from "../lib/telegram";
import { cleanWord, validateWord, wordKey } from "../lib/words";

/** Receives the admin's answers during /setword. Must be registered after all commands. */
export const setupInput = new Composer<Context>();

setupInput.chatType(["group", "supergroup"]).on("message", async (ctx, next) => {
  const session = getSession(sessionKey(ctx));
  if (!session || isCommand(ctx.msg)) return next();

  session.messageIds.push(ctx.msg.message_id);
  touchSession(session, ctx.api);

  // Step 1: the trigger word
  if (session.step === "word") {
    const text = ctx.msg.text;
    const error = text ? validateWord(text) : "Please send the word as plain text.";
    if (error) return ask(ctx, session, `❌ ${error}\n\n${WORD_PROMPT}`, "Trigger word");

    session.word = cleanWord(text!);
    session.step = "message";
    const exists = !!store.peek(ctx.chat.id)?.triggers[wordKey(session.word)];
    return ask(ctx, session, messagePrompt(session.word, exists), "Reply message");
  }

  // Step 2: the message to send
  const reply = extractReply(ctx.msg);
  if (!reply) {
    return ask(ctx, session, "❌ I can't save that kind of message. Try text, media, a file, location, contact or poll.", "Reply message");
  }

  const word = session.word!;
  endSession(session.key);
  const result = saveTrigger(ctx.chat.id, ctx.chat.title, {
    word,
    reply,
    createdBy: ctx.from?.id ?? 0,
    createdAt: Date.now(),
  });
  const cleaned = await deleteMany(ctx.api, ctx.chat.id, session.messageIds);

  if (!result) {
    await ctx.reply(`❌ This group already has ${config.maxTriggersPerChat} trigger words. Remove some with /removeword first.`);
    return;
  }
  const tip = cleaned ? "" : "\n\n<i>Tip: make me admin with “Delete messages” so I can clean up setup messages.</i>";
  await ctx.reply(
    `✅ Trigger <code>${escapeHtml(word)}</code> ${result.replaced ? "updated" : "saved"}! (${result.total} total)${tip}`,
    { parse_mode: "HTML" },
  );
});
