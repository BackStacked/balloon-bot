# 🎈 Balloon — trigger-word Telegram bot

Balloon auto-replies in groups when someone says a trigger word. Group admins set the words and replies with simple commands. A reply can be **anything**: text with formatting, photo, video, GIF, sticker, file/document, audio, voice, video note, location, venue, contact, poll or dice.

Built with TypeScript + [grammY](https://grammy.dev).

## Setup

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → name it **Balloon** → copy the token.
2. Install and configure:
   ```bash
   npm install
   cp .env.example .env      # then paste your token into BOT_TOKEN
   ```
3. Run it:
   ```bash
   npm run dev               # development (auto-restart on changes)
   npm run build && npm start   # production
   ```
4. Add the bot to your group and **make it an admin** with the **Delete messages** permission.
   (Admin rights let it read every message to catch trigger words, and delete the setup messages.
   Without admin rights you must turn off privacy mode in BotFather: `/setprivacy` → Disable.)

Requires Node.js 20.12+.

## How /setword works

```
Admin:   /setword
Balloon: 🎈 Send me the trigger word
Admin:   hello
Balloon: ✏️ Now send the message for "hello"
Admin:   Hey {mention}, welcome to {group}! 👋     ← or a photo, file, sticker, poll…
```

Balloon then **deletes** the `/setword` command, its own questions and the admin's answers, and posts one short `✅ Trigger "hello" saved!` confirmation.
Shortcut: `/setword hello` skips straight to the message. `/cancel` stops at any point; setup times out after 3 minutes of no reply.
Running `/setword` with an existing word replaces its message.

## Commands (admins only)

| Command | What it does |
|---|---|
| `/setword` | Add or replace a trigger word (asks for the word, then the message) |
| `/setword <word>` | Same, but skips the word question |
| `/cancel` | Cancel the current `/setword` |
| `/listwords` (`/words`) | List every word with a preview of its message |
| `/getword <word>` | Send a word's reply exactly as members would see it |
| `/removeword <word>` (`/delword`) | Delete one word |
| `/removeall` (`/clearwords`) | Delete all words (asks for confirmation with buttons) |
| `/stats` | Total replies sent and the most used words |
| `/export` | Get a JSON backup file of all words |
| `/import` | Reply to a backup file to restore or copy words into this group |
| `/settings` | Settings panel with buttons |
| `/mode word\|contains\|exact` | How words are matched (see below) |
| `/cooldown <seconds>` | Minimum time before the same word can fire again (0 = off) |
| `/enable` / `/disable` | Turn trigger replies on or off |
| `/help` | Show all commands (anyone) |
| `/start` | Intro + "Add me to a group" button (in private chat) |

### Match modes
- **word** (default): `hi` matches "hi there" and "Hi!", but not "this".
- **contains**: `hi` matches anywhere, including inside "this".
- **exact**: the whole message must be exactly `hi`.

Matching ignores case unless you turn on case sensitivity in `/settings`. If several words match, the longest one wins: "good morning" beats "good".

### Placeholders
You can use these in a text message or caption:

`{mention}` clickable name · `{first}` · `{last}` · `{fullname}` · `{username}` (@username, or the name if they have none) · `{id}` · `{group}` group title · `{word}` the trigger word

## Data

Words and settings are saved in `data/balloon.json` (you can change this with `DATA_FILE` in `.env`). Media is stored as Telegram `file_id`s, so backups only work with the same bot token.

## Project layout

```
src/
  index.ts              bot startup, command menu, error handling
  config.ts             env + limits
  storage.ts            JSON-file database
  types.ts              data types
  commands/
    general.ts          /start /help
    words.ts            /setword /listwords /removeword /removeall /stats /export /import ...
    settings.ts         /settings panel, /mode /cooldown /enable /disable
  handlers/
    setupInput.ts       captures the admin's answers during /setword
    triggers.ts         watches group messages and sends replies
    events.ts           welcome message, group→supergroup migration
  lib/                  formatting, matching, admin checks, reply sending
```
