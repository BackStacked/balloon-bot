import type { Api } from "grammy";
import type { Message, User } from "grammy/types";
import type { ReplyType, Trigger, TriggerReply } from "../types";
import { entitiesToHtml, escapeHtml, htmlToPlain, truncate } from "./html";
import { threadOf } from "./telegram";

/** Turn whatever the admin sent into a storable reply. Returns null for unsupported messages. */
export function extractReply(msg: Message): TriggerReply | null {
  if (msg.text) return { type: "text", text: entitiesToHtml(msg.text, msg.entities) };

  const caption = msg.caption ? entitiesToHtml(msg.caption, msg.caption_entities) : undefined;
  const spoiler = msg.has_media_spoiler || undefined;
  // animation must be checked before document (GIFs carry both), venue before location.
  if (msg.photo) return { type: "photo", fileId: msg.photo[msg.photo.length - 1].file_id, text: caption, spoiler };
  if (msg.animation) return { type: "animation", fileId: msg.animation.file_id, text: caption, spoiler };
  if (msg.video) return { type: "video", fileId: msg.video.file_id, text: caption, spoiler };
  if (msg.sticker) return { type: "sticker", fileId: msg.sticker.file_id };
  if (msg.voice) return { type: "voice", fileId: msg.voice.file_id, text: caption };
  if (msg.audio) return { type: "audio", fileId: msg.audio.file_id, text: caption };
  if (msg.video_note) return { type: "video_note", fileId: msg.video_note.file_id };
  if (msg.document) return { type: "document", fileId: msg.document.file_id, text: caption };
  if (msg.venue) {
    const { location, title, address, foursquare_id, google_place_id } = msg.venue;
    return {
      type: "venue",
      extra: { latitude: location.latitude, longitude: location.longitude, title, address, foursquare_id, google_place_id },
    };
  }
  if (msg.location) {
    return { type: "location", extra: { latitude: msg.location.latitude, longitude: msg.location.longitude } };
  }
  if (msg.contact) {
    const { phone_number, first_name, last_name, vcard } = msg.contact;
    return { type: "contact", extra: { phone_number, first_name, last_name, vcard } };
  }
  if (msg.dice) return { type: "dice", extra: { emoji: msg.dice.emoji } };
  if (msg.poll) {
    const p = msg.poll;
    // A quiz needs its correct answer; if Telegram didn't share it, fall back to a normal poll.
    const quiz = p.type === "quiz" && !!p.correct_option_ids?.length;
    return {
      type: "poll",
      extra: {
        question: p.question,
        options: p.options.map((o) => o.text),
        is_anonymous: p.is_anonymous,
        type: quiz ? "quiz" : "regular",
        allows_multiple_answers: quiz ? false : p.allows_multiple_answers,
        correct_option_ids: quiz ? p.correct_option_ids : undefined,
        explanation: quiz ? p.explanation : undefined,
      },
    };
  }
  return null;
}

export const PLACEHOLDERS = ["mention", "first", "last", "fullname", "username", "id", "group", "word"];

/** Replace {mention}, {first}, ... in stored HTML with values for the user who triggered it. */
export function fillPlaceholders(html: string, v: { user?: User; group?: string; word: string }): string {
  const u = v.user;
  const first = u?.first_name ?? "";
  const last = u?.last_name ?? "";
  const full = [first, last].filter(Boolean).join(" ");
  const values: Record<string, string> = {
    mention: u ? `<a href="tg://user?id=${u.id}">${escapeHtml(full || "user")}</a>` : "",
    first: escapeHtml(first),
    last: escapeHtml(last),
    fullname: escapeHtml(full),
    username: escapeHtml(u?.username ? `@${u.username}` : full),
    id: u ? String(u.id) : "",
    group: escapeHtml(v.group ?? ""),
    word: escapeHtml(v.word),
  };
  return html.replace(/\{(\w+)\}/g, (m, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : m,
  );
}

/** Send a trigger's reply in response to `source`. */
export async function sendTriggerReply(
  api: Api,
  source: Message,
  t: Trigger,
  opts: { user?: User; replyTo: boolean },
) {
  const chatId = source.chat.id;
  const group = "title" in source.chat ? source.chat.title : undefined;
  const html = t.reply.text ? fillPlaceholders(t.reply.text, { user: opts.user, group, word: t.word }) : undefined;

  const common = {
    ...threadOf(source),
    ...(opts.replyTo
      ? { reply_parameters: { message_id: source.message_id, allow_sending_without_reply: true } }
      : {}),
  };
  const media = { ...common, caption: html, parse_mode: "HTML" as const };
  const visual = { ...media, has_spoiler: t.reply.spoiler };
  const fileId = t.reply.fileId ?? "";
  const x = t.reply.extra ?? {};

  switch (t.reply.type) {
    case "text":
      return api.sendMessage(chatId, html || escapeHtml(t.word), { ...common, parse_mode: "HTML" });
    case "photo":
      return api.sendPhoto(chatId, fileId, visual);
    case "video":
      return api.sendVideo(chatId, fileId, visual);
    case "animation":
      return api.sendAnimation(chatId, fileId, visual);
    case "document":
      return api.sendDocument(chatId, fileId, media);
    case "audio":
      return api.sendAudio(chatId, fileId, media);
    case "voice":
      return api.sendVoice(chatId, fileId, media);
    case "sticker":
      return api.sendSticker(chatId, fileId, common);
    case "video_note":
      return api.sendVideoNote(chatId, fileId, common);
    case "location":
      return api.sendLocation(chatId, x.latitude, x.longitude, common);
    case "venue":
      return api.sendVenue(chatId, x.latitude, x.longitude, x.title, x.address, {
        ...common,
        foursquare_id: x.foursquare_id,
        google_place_id: x.google_place_id,
      });
    case "contact":
      return api.sendContact(chatId, x.phone_number, x.first_name, {
        ...common,
        last_name: x.last_name,
        vcard: x.vcard,
      });
    case "dice":
      return api.sendDice(chatId, x.emoji ?? "🎲", common);
    case "poll":
      return api.sendPoll(
        chatId,
        x.question,
        (x.options as string[]).map((text) => ({ text })),
        {
          ...common,
          is_anonymous: x.is_anonymous,
          type: x.type,
          allows_multiple_answers: x.allows_multiple_answers,
          correct_option_ids: x.correct_option_ids,
          explanation: x.explanation,
        },
      );
  }
}

const LABELS: Record<ReplyType, string> = {
  text: "💬 Text",
  photo: "🖼 Photo",
  video: "🎬 Video",
  animation: "🎞 GIF",
  sticker: "🏷 Sticker",
  document: "📄 File",
  audio: "🎵 Audio",
  voice: "🎤 Voice",
  video_note: "📹 Video note",
  location: "📍 Location",
  venue: "📍 Venue",
  contact: "👤 Contact",
  dice: "🎲 Dice",
  poll: "📊 Poll",
};

/** One-line HTML summary of a reply for /listwords. */
export function describeReply(r: TriggerReply, max = 100): string {
  const x = r.extra ?? {};
  const label =
    r.type === "poll" ? x.question : r.type === "venue" ? x.title : r.type === "contact" ? x.first_name : r.type === "dice" ? x.emoji : undefined;
  const plain = r.text ? htmlToPlain(r.text) : typeof label === "string" ? label : "";
  const preview = plain ? escapeHtml(truncate(plain.replace(/\s+/g, " ").trim(), max)) : "";
  if (r.type === "text") return preview || "<i>(empty)</i>";
  return `<i>${LABELS[r.type]}</i>${preview ? ` — ${preview}` : ""}`;
}
