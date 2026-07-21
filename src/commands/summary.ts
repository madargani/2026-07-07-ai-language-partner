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

    // Pass summary data to endSession for SessionSummary persistence (per D-13)
    await endSession(interaction.user.id, {
      strengths: summary.strengths,
      expandedCount: summary.expandedCount,
      queueHealth: summary.queueHealth,
      summary: summary.summary,
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📊 Session Summary")
      .addFields(
        // ── Existing fields ──
        { name: "Messages", value: String(summary.messageCount), inline: true },
        { name: "Corrections", value: String(summary.correctionCount), inline: true },
        { name: "Duration", value: summary.duration, inline: true },

        // ── Separator ──
        { name: "\u200B", value: "\u200B", inline: false },

        // ── Strengths (per D-03) ──
        {
          name: "🏆 Top Strengths",
          value: summary.hasStrengths
            ? summary.strengths
                .map((s, i) => `**${i + 1}. ${s.term}** — ${s.explanation}`)
                .join("\n")
            : "Session too short to analyze.",
          inline: false,
        },

        // ── Expansion metrics (per D-08) ──
        { name: "📈 New Items", value: `${summary.expandedCount} extracted`, inline: true },

        // ── Queue health (per D-09, D-10) ──
        { name: "📚 Queue", value: `${summary.queueHealth} due in 24h`, inline: true },
      )
      .setTimestamp();

    if (summary.summary) {
      embed.addFields({ name: "\u200B", value: "\u200B", inline: false });
      embed.addFields({ name: "Summary", value: summary.summary });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
