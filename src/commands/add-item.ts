import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption,
} from "discord.js";
import { prisma } from "../lib/prisma.js";
import { createItem } from "../services/fsrs.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("add-item")
    .setDescription("Add a vocabulary or grammar item for spaced repetition")
    .addStringOption(
      new SlashCommandStringOption()
        .setName("source")
        .setDescription("Foreign word or phrase to review")
        .setRequired(true),
    )
    .addStringOption(
      new SlashCommandStringOption()
        .setName("type")
        .setDescription("Type of item")
        .setRequired(true)
        .addChoices(
          { name: "Vocabulary", value: "vocabulary" },
          { name: "Grammar Pattern", value: "grammar" },
        ),
    )
    .addStringOption(
      new SlashCommandStringOption()
        .setName("language")
        .setDescription("Target language (defaults to your configured language)")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });

      if (!user?.configured) {
        await interaction.editReply(
          "⚠️ You need to configure your languages first with `/setup`.",
        );
        return;
      }

      const source = interaction.options.getString("source", true);
      const type = interaction.options.getString("type", true) as
        | "vocabulary"
        | "grammar";
      const language =
        interaction.options.getString("language") ?? user.targetLanguage;

      const item = await createItem({
        userId: user.id,
        source,
        type,
        language,
      });

      await interaction.editReply(
        `✅ Item added! \`${source}\` (${type}) — ready for review from ${item.due.toLocaleDateString()}`,
      );
    } catch (error) {
      console.error("Failed to add item:", error);
      await interaction.editReply(
        "❌ Failed to add item. Please try again.",
      );
    }
  },
};
