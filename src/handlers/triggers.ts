import { Composer, type Context } from "grammy";
import { store } from "../storage";
import { sendTriggerReply } from "../lib/reply";
import { findTrigger, wordKey } from "../lib/words";

/** Watches group messages and fires the matching trigger's reply. */
export const triggers = new Composer<Context>();

const lastFired = new Map<string, number>();

triggers.chatType(["group", "supergroup"]).on(["message:text", "message:caption"], async (ctx) => {
  if (ctx.from?.is_bot) return;
  const chat = store.peek(ctx.chat.id);
  if (!chat?.settings.enabled) return;

  const text = ctx.msg.text ?? ctx.msg.caption ?? "";
  if (text.startsWith("/")) return;

  const trigger = findTrigger(text, chat);
  if (!trigger) return;

  const { cooldown, replyToMessage } = chat.settings;
  if (cooldown > 0) {
    const key = `${ctx.chat.id}:${wordKey(trigger.word)}`;
    const now = Date.now();
    if (now - (lastFired.get(key) ?? 0) < cooldown * 1000) return;
    lastFired.set(key, now);
  }

  trigger.hits++;
  store.save();
  await sendTriggerReply(ctx.api, ctx.msg, trigger, { user: ctx.from, replyTo: replyToMessage });
});
