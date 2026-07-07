import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { prisma } from "../lib/prisma.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("new")
    .setDescription("Start a new conversation session"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });

    if (!user?.configured) {
      await interaction.editReply(
        "⚠️ You need to configure your languages first! Please run `/setup` to set your native and target languages.",
      );
      return;
    }

    await interaction.editReply(
      "📝 Conversation sessions are coming in Phase 2! You're all configured — your target language is ready.",
    );
  },
};
