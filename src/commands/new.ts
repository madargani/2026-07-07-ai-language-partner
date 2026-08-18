import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption,
} from "discord.js";
import { prisma } from "../lib/prisma.js";
import { createSession } from "../services/conversation.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("new")
    .setDescription("Start a new conversation session")
    .addStringOption(
      new SlashCommandStringOption()
        .setName("session_name")
        .setDescription("Optional name for your session")
        .setRequired(false),
    ),

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

    const sessionName = interaction.options.getString("session_name") ?? undefined;

    await createSession(interaction, sessionName);
  },
};
