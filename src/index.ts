import { Bot, GrammyError, HttpError } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { BOT_NAME, config } from "./config";
import { store } from "./storage";
import { general } from "./commands/general";
import { settings } from "./commands/settings";
import { words } from "./commands/words";
import { events } from "./handlers/events";
import { setupInput } from "./handlers/setupInput";
import { triggers } from "./handlers/triggers";

const bot = new Bot(config.token);
bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }));

// Order matters: commands first, then /setword answers, then trigger matching.
bot.use(events);
bot.use(general);
bot.use(settings);
bot.use(words);
bot.use(setupInput);
bot.use(triggers);

bot.catch(({ ctx, error }) => {
  const where = `update ${ctx.update.update_id}`;
  if (error instanceof GrammyError) console.error(`Telegram error in ${where}: ${error.description}`);
  else if (error instanceof HttpError) console.error(`Network error in ${where}:`, error.error);
  else console.error(`Error in ${where}:`, error);
});

const ADMIN_COMMANDS = [
  { command: "setword", description: "Add a trigger word" },
  { command: "listwords", description: "Show all words and messages" },
  { command: "getword", description: "Preview a word's message" },
  { command: "removeword", description: "Delete a trigger word" },
  { command: "removeall", description: "Delete all trigger words" },
  { command: "cancel", description: "Cancel /setword" },
  { command: "settings", description: "Open the settings panel" },
  { command: "mode", description: "Match mode: word / contains / exact" },
  { command: "cooldown", description: "Seconds before a word can fire again" },
  { command: "enable", description: "Turn trigger replies on" },
  { command: "disable", description: "Turn trigger replies off" },
  { command: "stats", description: "Most used trigger words" },
  { command: "export", description: "Download a backup of all words" },
  { command: "import", description: "Restore words from a backup file" },
  { command: "help", description: "How to use Balloon" },
];

async function main() {
  await bot.api.setMyCommands([{ command: "help", description: "How to use Balloon" }], {
    scope: { type: "all_group_chats" },
  });
  await bot.api.setMyCommands(ADMIN_COMMANDS, { scope: { type: "all_chat_administrators" } });
  await bot.api.setMyCommands(
    [
      { command: "start", description: "Start Balloon" },
      { command: "help", description: "How to use Balloon" },
    ],
    { scope: { type: "all_private_chats" } },
  );

  const shutdown = async () => {
    await bot.stop();
    store.flush();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.start({
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    onStart: (me) => console.log(`🎈 ${BOT_NAME} is running as @${me.username}`),
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  store.flush();
  process.exit(1);
});
