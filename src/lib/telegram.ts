import type { Api, Context, MiddlewareFn } from "grammy";
import type { Message } from "grammy/types";

const ADMIN_CACHE_MS = 60_000;
const adminCache = new Map<string, { admin: boolean; at: number }>();

/** Is the sender of this update an admin of the group? Handles anonymous admins. */
export async function isAdmin(ctx: Context): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) return false;

  // Anonymous admins post "as the group" itself.
  if (ctx.senderChat?.id === chat.id) return true;

  const userId = ctx.from?.id;
  if (!userId) return false;

  const key = `${chat.id}:${userId}`;
  const cached = adminCache.get(key);
  if (cached && Date.now() - cached.at < ADMIN_CACHE_MS) return cached.admin;

  try {
    const member = await ctx.api.getChatMember(chat.id, userId);
    const admin = member.status === "creator" || member.status === "administrator";
    adminCache.set(key, { admin, at: Date.now() });
    return admin;
  } catch {
    return false;
  }
}

/** Middleware: only let group admins through. */
export const adminGuard: MiddlewareFn<Context> = async (ctx, next) => {
  const chat = ctx.chat;
  if (!chat || chat.type === "channel") return;
  if (chat.type === "private") {
    await ctx.reply("🎈 This command works in groups. Add me to a group and run it there.");
    return;
  }
  if (!(await isAdmin(ctx))) {
    const m = await ctx.reply("⛔ Only group admins can use this command.", {
      reply_parameters: ctx.msg ? { message_id: ctx.msg.message_id, allow_sending_without_reply: true } : undefined,
    });
    autoDelete(ctx.api, m.chat.id, m.message_id, 10);
    return;
  }
  await next();
};

/** Delete several messages. Returns false if any could not be deleted (usually missing rights). */
export async function deleteMany(api: Api, chatId: number, ids: number[]): Promise<boolean> {
  const unique = [...new Set(ids)];
  if (!unique.length) return true;
  try {
    await api.deleteMessages(chatId, unique);
    return true;
  } catch {
    let ok = true;
    for (const id of unique) await api.deleteMessage(chatId, id).catch(() => (ok = false));
    return ok;
  }
}

export function autoDelete(api: Api, chatId: number, messageId: number, seconds: number) {
  setTimeout(() => api.deleteMessage(chatId, messageId).catch(() => {}), seconds * 1000);
}

export function isCommand(msg: Message): boolean {
  const first = msg.entities?.[0];
  return first?.type === "bot_command" && first.offset === 0;
}

/** Keep replies inside the same forum topic. */
export function threadOf(msg?: Message): { message_thread_id?: number } {
  return msg?.is_topic_message ? { message_thread_id: msg.message_thread_id } : {};
}
