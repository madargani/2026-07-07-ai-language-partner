import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  async execute(interaction) {
    await interaction.deferReply();
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.editReply(`Pong! 🏓 Latency: ${latency}ms`);
  },
};
