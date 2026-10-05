import { Composer, InlineKeyboard, type Context } from "grammy";
import { BOT_NAME } from "../config";
import { PLACEHOLDERS } from "../lib/reply";

export const general = new Composer<Context>();

export const HELP_TEXT = [
  `🎈 <b>${BOT_NAME}</b> — I auto-reply when someone says a trigger word.`,
  "",
  "<b>Trigger words</b> (admins)",
  "/setword — add a word (I ask for the word, then the message)",
  "/setword <code>word</code> — skip straight to the message",
  "/cancel — stop the current /setword",
  "/listwords — show all words and their messages",
  "/getword <code>word</code> — preview a word's message",
  "/removeword <code>word</code> — delete one word",
  "/removeall — delete every word",
  "/stats — most used words",
  "/export — download a backup file",
  "/import — reply to a backup file to restore it",
  "",
  "<b>Settings</b> (admins)",
  "/settings — settings panel with buttons",
  "/mode <code>word|contains|exact</code> — how words are matched",
  "/cooldown <code>seconds</code> — delay before a word can fire again",
  "/enable · /disable — turn replies on or off",
  "",
  "<b>Reply can be anything</b>: text, photo, video, GIF, sticker, file, audio, voice, video note, location, contact, poll or dice.",
  "",
  "<b>Placeholders</b> for the message:",
  PLACEHOLDERS.map((p) => `<code>{${p}}</code>`).join(" "),
].join("\n");

general.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") {
    return ctx.reply(`🎈 ${BOT_NAME} is here! Admins can use /setword to add a trigger word. See /help.`);
  }
  await ctx.reply(
    `🎈 Hi! I'm <b>${BOT_NAME}</b>.\n\nAdd me to your group, make me an admin, and use /setword there to create trigger words. Whenever someone says one, I send the message you set.\n\nSee /help for every command.`,
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url("➕ Add me to a group", `https://t.me/${ctx.me.username}?startgroup=true`),
    },
  );
});

general.command("help", (ctx) =>
  ctx.reply(HELP_TEXT, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
);
