import { Composer, type Context } from "grammy";
import { BOT_NAME } from "../config";
import { store } from "../storage";

export const events = new Composer<Context>();

// Say hello when added to a group.
events.on("my_chat_member", async (ctx) => {
  if (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup") return;
  const { old_chat_member: before, new_chat_member: after } = ctx.myChatMember;
  const wasOut = before.status === "left" || before.status === "kicked";
  const isIn = after.status === "member" || after.status === "administrator";
  if (!wasOut || !isIn) return;

  await ctx
    .reply(
      [
        `🎈 Hi, I'm <b>${BOT_NAME}</b>! I reply automatically when someone says a trigger word.`,
        "",
        "To get started:",
        "1. Make me an <b>admin</b> with the <b>Delete messages</b> permission",
        "2. Use /setword to add your first trigger word",
        "",
        "See /help for all commands.",
      ].join("\n"),
      { parse_mode: "HTML" },
    )
    .catch(() => {});
});

// Keep data when a group is upgraded to a supergroup (its id changes).
events.on("message:migrate_to_chat_id", (ctx) => {
  store.migrate(ctx.chat.id, ctx.msg.migrate_to_chat_id);
});
