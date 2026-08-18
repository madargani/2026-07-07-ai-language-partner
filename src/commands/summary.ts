import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { endSession, getSessionSummary } from "../services/conversation.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("End your session and see a summary"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const summary = await getSessionSummary(interaction.user.id);

    if (!summary) {
      await interaction.editReply(
        "You don't have an active session.",
      );
      return;
    }

    await endSession(interaction.user.id);

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📊 Session Summary")
      .addFields(
        { name: "Messages", value: String(summary.messageCount), inline: true },
        {
          name: "Corrections",
          value: String(summary.correctionCount),
          inline: true,
        },
        { name: "Duration", value: summary.duration, inline: true },
      )
      .setTimestamp();

    if (summary.summary) {
      embed.addFields({ name: "Summary", value: summary.summary });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
