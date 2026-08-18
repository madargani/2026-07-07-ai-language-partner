import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { endSession } from "../services/conversation.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("end")
    .setDescription("End your current conversation session"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await endSession(interaction.user.id);

    if (!result) {
      await interaction.editReply(
        "You don't have an active session.",
      );
      return;
    }

    await interaction.editReply(
      "✅ Session ended! Your conversation has been saved.",
    );
  },
};
