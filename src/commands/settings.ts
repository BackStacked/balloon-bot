import { Composer, InlineKeyboard, type Context } from "grammy";
import { store } from "../storage";
import type { ChatSettings, MatchMode } from "../types";
import { adminGuard, isAdmin } from "../lib/telegram";

export const settings = new Composer<Context>();

const MODES: MatchMode[] = ["word", "contains", "exact"];
const MODE_INFO: Record<MatchMode, string> = {
  word: "whole word — <code>hi</code> matches “hi there”, not “this”",
  contains: "anywhere — <code>hi</code> matches “this” too",
  exact: "exact — the whole message must be the word",
};
const COOLDOWN_STEPS = [0, 5, 10, 30, 60, 300];

function panelText(s: ChatSettings): string {
  return [
    "⚙️ <b>Balloon settings</b>",
    "",
    `Replies: <b>${s.enabled ? "on ✅" : "off ❌"}</b>`,
    `Match: ${MODE_INFO[s.matchMode]}`,
    `Case sensitive: <b>${s.caseSensitive ? "yes" : "no"}</b>`,
    `Reply to the message: <b>${s.replyToMessage ? "yes" : "no"}</b>`,
    `Cooldown: <b>${s.cooldown}s</b> per word`,
    "",
    "<i>Tap a button to change it.</i>",
  ].join("\n");
}

function panelKeyboard(s: ChatSettings): InlineKeyboard {
  return new InlineKeyboard()
    .text(s.enabled ? "✅ Replies on" : "❌ Replies off", "set:enabled")
    .text(`🎯 Match: ${s.matchMode}`, "set:mode")
    .row()
    .text(`🔠 Case: ${s.caseSensitive ? "sensitive" : "ignore"}`, "set:case")
    .text(`↩️ Reply: ${s.replyToMessage ? "yes" : "no"}`, "set:reply")
    .row()
    .text(`⏱ Cooldown: ${s.cooldown}s`, "set:cooldown")
    .text("✖️ Close", "set:close");
}

settings.command("settings", adminGuard, async (ctx) => {
  const s = store.chat(ctx.chat.id).settings;
  await ctx.reply(panelText(s), { parse_mode: "HTML", reply_markup: panelKeyboard(s) });
});

settings.callbackQuery(/^set:\w+$/, async (ctx) => {
  if (!(await isAdmin(ctx))) {
    return ctx.answerCallbackQuery({ text: "Only admins can change settings.", show_alert: true });
  }
  const action = ctx.callbackQuery.data.slice("set:".length);
  if (action === "close") {
    await ctx.deleteMessage().catch(() => {});
    return ctx.answerCallbackQuery();
  }

  const s = store.chat(ctx.chat!.id).settings;
  switch (action) {
    case "enabled":
      s.enabled = !s.enabled;
      break;
    case "mode":
      s.matchMode = MODES[(MODES.indexOf(s.matchMode) + 1) % MODES.length];
      break;
    case "case":
      s.caseSensitive = !s.caseSensitive;
      break;
    case "reply":
      s.replyToMessage = !s.replyToMessage;
      break;
    case "cooldown":
      s.cooldown = COOLDOWN_STEPS.find((c) => c > s.cooldown) ?? 0;
      break;
  }
  store.save();
  await ctx.editMessageText(panelText(s), { parse_mode: "HTML", reply_markup: panelKeyboard(s) }).catch(() => {});
  await ctx.answerCallbackQuery({ text: "Saved ✅" });
});

settings.command("mode", adminGuard, async (ctx) => {
  const mode = ctx.match.trim().toLowerCase() as MatchMode;
  const s = store.chat(ctx.chat.id).settings;
  if (!MODES.includes(mode)) {
    return ctx.reply(
      `🎯 Current match mode: <b>${s.matchMode}</b>\n\nUsage: <code>/mode word</code>, <code>/mode contains</code> or <code>/mode exact</code>\n\n` +
        MODES.map((m) => `• <b>${m}</b>: ${MODE_INFO[m]}`).join("\n"),
      { parse_mode: "HTML" },
    );
  }
  s.matchMode = mode;
  store.save();
  await ctx.reply(`🎯 Match mode set to <b>${mode}</b> (${MODE_INFO[mode]}).`, { parse_mode: "HTML" });
});

settings.command("cooldown", adminGuard, async (ctx) => {
  const arg = ctx.match.trim();
  const s = store.chat(ctx.chat.id).settings;
  const seconds = Number(arg);
  if (!arg || !Number.isInteger(seconds) || seconds < 0 || seconds > 86_400) {
    return ctx.reply(
      `⏱ Current cooldown: <b>${s.cooldown}s</b>\n\nUsage: <code>/cooldown 30</code> (seconds, 0 = off, max 86400)`,
      { parse_mode: "HTML" },
    );
  }
  s.cooldown = seconds;
  store.save();
  await ctx.reply(seconds ? `⏱ Each word can now fire once every <b>${seconds}s</b>.` : "⏱ Cooldown turned off.", {
    parse_mode: "HTML",
  });
});

settings.command(["enable", "on"], adminGuard, async (ctx) => {
  store.chat(ctx.chat.id).settings.enabled = true;
  store.save();
  await ctx.reply("🎈 Trigger replies are <b>on</b>.", { parse_mode: "HTML" });
});

settings.command(["disable", "off"], adminGuard, async (ctx) => {
  store.chat(ctx.chat.id).settings.enabled = false;
  store.save();
  await ctx.reply("😴 Trigger replies are <b>off</b>. Use /enable to turn them back on.", { parse_mode: "HTML" });
});
