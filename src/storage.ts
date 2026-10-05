import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import type { ChatData, ChatSettings } from "./types";

export const DEFAULT_SETTINGS: ChatSettings = {
  enabled: true,
  matchMode: "word",
  caseSensitive: false,
  cooldown: 0,
  replyToMessage: true,
};

interface DbShape {
  version: 1;
  chats: Record<string, ChatData>;
}

/** Tiny JSON-file database. Writes are debounced and atomic (tmp file + rename). */
class Store {
  private data: DbShape;
  private dirty = false;
  private timer?: NodeJS.Timeout;

  constructor(private readonly file: string) {
    this.data = this.load();
  }

  private load(): DbShape {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, chats: {} };
      throw err;
    }
    // A corrupt file throws here on purpose: better to stop than to overwrite saved words.
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    const chats = parsed.chats ?? {};
    for (const chat of Object.values(chats)) {
      chat.settings = { ...DEFAULT_SETTINGS, ...chat.settings };
      chat.triggers ??= {};
    }
    return { version: 1, chats };
  }

  /** Read-only lookup; does not create an entry. */
  peek(chatId: number): ChatData | undefined {
    return this.data.chats[String(chatId)];
  }

  /** Get the chat's data, creating it with defaults if needed. */
  chat(chatId: number): ChatData {
    const key = String(chatId);
    return (this.data.chats[key] ??= { settings: { ...DEFAULT_SETTINGS }, triggers: {} });
  }

  /** Group → supergroup upgrades change the chat id. */
  migrate(fromId: number, toId: number) {
    const from = this.data.chats[String(fromId)];
    if (!from) return;
    this.data.chats[String(toId)] = from;
    delete this.data.chats[String(fromId)];
    this.save();
  }

  save() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 250);
  }

  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return;
    this.dirty = false;
    fs.mkdirSync(path.dirname(path.resolve(this.file)), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

export const store = new Store(config.dataFile);
