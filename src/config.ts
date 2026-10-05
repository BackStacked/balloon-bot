try {
  process.loadEnvFile();
} catch {
  // No .env file — fall back to real environment variables.
}

const token = process.env.BOT_TOKEN?.trim();
if (!token) {
  console.error("❌ BOT_TOKEN is missing. Copy .env.example to .env and paste your token from @BotFather.");
  process.exit(1);
}

export const config = {
  token,
  dataFile: process.env.DATA_FILE?.trim() || "data/balloon.json",
  /** How long an admin has to answer each /setword question. */
  setupTimeoutMs: 3 * 60_000,
  maxTriggersPerChat: 500,
  maxWordLength: 100,
};

export const BOT_NAME = "Balloon";
