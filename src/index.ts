import "dotenv/config";
import { client } from "./client.js";
import { deployCommands } from "./deploy-commands.js";
import { registerInteractionCreateHandler } from "./events/interactionCreate.js";
import { registerMessageCreateHandler } from "./events/messageCreate.js";
import { registerReadyHandler } from "./events/ready.js";
import { env } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
import { rehydrateSessions } from "./services/conversation.js";

// Register event handlers
registerReadyHandler(client);
registerInteractionCreateHandler(client);
registerMessageCreateHandler(client);

// ──────────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${signal}] Graceful shutdown started`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timeout — force exiting");
    process.exit(1);
  }, 10_000);

  try {
    await client.destroy();
    console.log("Discord client destroyed");

    await prisma.$disconnect();
    console.log("Prisma disconnected");

    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ──────────────────────────────────────────────────
// Start bot
// ──────────────────────────────────────────────────

async function main() {
  // Deploy commands before login
  try {
    await deployCommands();
    console.log("Commands deployed");
  } catch (err) {
    console.warn("Command deployment failed — continuing with login", err);
  }

  await client.login(env.DISCORD_TOKEN);
  console.log("Bot logged in successfully");
}

main().catch((err) => {
  console.error("Failed to start bot:", err);
  process.exit(1);
});
