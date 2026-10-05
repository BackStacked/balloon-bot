export const REPLY_TYPES = [
  "text",
  "photo",
  "video",
  "animation",
  "sticker",
  "document",
  "audio",
  "voice",
  "video_note",
  "location",
  "venue",
  "contact",
  "dice",
  "poll",
] as const;

export type ReplyType = (typeof REPLY_TYPES)[number];

/** The message Balloon sends when a trigger word is seen. */
export interface TriggerReply {
  type: ReplyType;
  /** HTML body for text replies, HTML caption for media replies. */
  text?: string;
  /** Telegram file_id for media replies. */
  fileId?: string;
  /** Media sent with a spoiler blur. */
  spoiler?: boolean;
  /** Type-specific fields for location / venue / contact / dice / poll. */
  extra?: Record<string, any>;
}

export interface Trigger {
  word: string;
  reply: TriggerReply;
  createdBy: number;
  createdAt: number;
  hits: number;
}

/**
 * word     – trigger must appear as a whole word/phrase ("hi" matches "hi there", not "this")
 * contains – trigger can appear anywhere ("hi" matches "this")
 * exact    – the whole message must equal the trigger
 */
export type MatchMode = "word" | "contains" | "exact";

export interface ChatSettings {
  enabled: boolean;
  matchMode: MatchMode;
  caseSensitive: boolean;
  /** Seconds before the same word can fire again in this chat. */
  cooldown: number;
  /** Reply to the triggering message instead of sending a standalone message. */
  replyToMessage: boolean;
}

export interface ChatData {
  title?: string;
  settings: ChatSettings;
  /** Keyed by normalized (lower-cased) word. */
  triggers: Record<string, Trigger>;
}
