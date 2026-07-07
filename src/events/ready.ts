import type { Client } from "discord.js";
import { commands } from "../commands/index.js";

export function registerReadyHandler(client: Client): void {
  client.on("ready", () => {
    console.log(`Logged in as ${client.user?.tag}`);
    console.log(`Serving ${client.guilds.cache.size} guilds`);
    console.log(
      `Registered commands: ${commands
        .map((c) => {
          const json = c.data.toJSON();
          return json.name;
        })
        .join(", ")}`,
    );
  });
}
