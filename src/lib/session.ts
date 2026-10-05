import type { Api, Context } from "grammy";
import { config } from "../config";
import { autoDelete, deleteMany } from "./telegram";

/** An in-progress /setword conversation with one admin in one group. */
export interface SetupSession {
  key: string;
  chatId: number;
  threadId?: number;
  step: "word" | "message";
  word?: string;
  /** Everything to clean up when setup ends: the command, bot questions, admin answers. */
  messageIds: number[];
  timer?: NodeJS.Timeout;
}

const sessions = new Map<string, SetupSession>();

export function sessionKey(ctx: Context): string {
  return `${ctx.chat?.id}:${ctx.senderChat?.id ?? ctx.from?.id}`;
}

export function getSession(key: string): SetupSession | undefined {
  return sessions.get(key);
}

export function startSession(ctx: Context): SetupSession {
  const key = sessionKey(ctx);
  endSession(key);
  const msg = ctx.msg!;
  const session: SetupSession = {
    key,
    chatId: msg.chat.id,
    threadId: msg.is_topic_message ? msg.message_thread_id : undefined,
    step: "word",
    messageIds: [msg.message_id],
  };
  sessions.set(key, session);
  touchSession(session, ctx.api);
  return session;
}

/** Restart the inactivity timer. */
export function touchSession(session: SetupSession, api: Api) {
  clearTimeout(session.timer);
  session.timer = setTimeout(async () => {
    if (sessions.get(session.key) !== session) return;
    sessions.delete(session.key);
    await deleteMany(api, session.chatId, session.messageIds);
    const m = await api
      .sendMessage(session.chatId, "⌛ /setword timed out. Run it again whenever you're ready.", {
        message_thread_id: session.threadId,
      })
      .catch(() => undefined);
    if (m) autoDelete(api, m.chat.id, m.message_id, 10);
  }, config.setupTimeoutMs);
}

/** Stop a session and return it (so the caller can clean up its messages). */
export function endSession(key: string): SetupSession | undefined {
  const session = sessions.get(key);
  if (!session) return undefined;
  clearTimeout(session.timer);
  sessions.delete(key);
  return session;
}
