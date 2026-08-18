import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { env } from "./lib/config.js";

export async function deployCommands() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  const commandData = commands.map((c) => c.data.toJSON());

  if (env.NODE_ENV === "development") {
    if (!env.DISCORD_GUILD_ID) {
      throw new Error(
        "DISCORD_GUILD_ID is required for development command deployment",
      );
    }
    console.log(`Deploying ${commandData.length} guild commands...`);
    await rest.put(
      Routes.applicationGuildCommands(
        env.DISCORD_CLIENT_ID,
        env.DISCORD_GUILD_ID,
      ),
      { body: commandData },
    );
  } else {
    console.log(`Deploying ${commandData.length} global commands...`);
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: commandData,
    });
  }
  console.log("Commands deployed successfully.");
}

// Allow running as standalone script
const isMainModule =
  process.argv[1]?.endsWith("deploy-commands.js") ||
  process.argv[1]?.endsWith("deploy-commands.ts");
if (isMainModule) {
  deployCommands().catch(console.error);
}
