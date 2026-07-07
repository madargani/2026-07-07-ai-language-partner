import type { Client, Interaction } from "discord.js";
import { commands } from "../commands/index.js";

const commandMap = new Map(
  commands.map((cmd) => {
    const json = cmd.data.toJSON();
    return [json.name, cmd];
  }),
);

export function registerInteractionCreateHandler(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) {
      console.error(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `Error executing command ${interaction.commandName}:`,
        error,
      );
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(
          "An error occurred while executing this command.",
        );
      } else {
        await interaction.reply({
          content: "An error occurred while executing this command.",
          ephemeral: true,
        });
      }
    }
  });
}
