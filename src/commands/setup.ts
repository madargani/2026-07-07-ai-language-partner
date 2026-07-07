import {
  ActionRowBuilder,
  ComponentType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import { LANGUAGES } from "../lib/languages.js";
import { prisma } from "../lib/prisma.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure your native and target languages"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Step 1: Send native language select menu
      const nativeSelect = new StringSelectMenuBuilder()
        .setCustomId("native_lang")
        .setPlaceholder("Select your native language")
        .addOptions(
          LANGUAGES.map((lang) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(lang.label)
              .setValue(lang.code),
          ),
        );

      await interaction.editReply({
        content: "**Step 1/2:** What is your native language?",
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            nativeSelect,
          ),
        ],
      });

      // Collect native language selection
      const nativeResponse = await interaction.channel!.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) =>
          i.customId === "native_lang" && i.user.id === interaction.user.id,
        time: 60_000,
      });

      const nativeLang = nativeResponse.values[0];
      const nativeLabel =
        LANGUAGES.find((l) => l.code === nativeLang)?.label ?? nativeLang;
      await nativeResponse.deferUpdate();

      // Step 2: Send target language select menu (exclude native)
      const targetSelect = new StringSelectMenuBuilder()
        .setCustomId("target_lang")
        .setPlaceholder("Select your target language")
        .addOptions(
          LANGUAGES.filter((l) => l.code !== nativeLang).map((lang) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(lang.label)
              .setValue(lang.code),
          ),
        );

      await interaction.editReply({
        content: `**Step 2/2:** What language would you like to learn? (Native: ${nativeLabel})`,
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            targetSelect,
          ),
        ],
      });

      // Collect target language selection
      const targetResponse = await interaction.channel!.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        filter: (i) =>
          i.customId === "target_lang" && i.user.id === interaction.user.id,
        time: 60_000,
      });

      const targetLang = targetResponse.values[0];
      const targetLabel =
        LANGUAGES.find((l) => l.code === targetLang)?.label ?? targetLang;
      await targetResponse.deferUpdate();

      // Save to database
      await prisma.user.upsert({
        where: { discordId: interaction.user.id },
        update: {
          nativeLanguage: nativeLang,
          targetLanguage: targetLang,
          configured: true,
        },
        create: {
          discordId: interaction.user.id,
          nativeLanguage: nativeLang,
          targetLanguage: targetLang,
          configured: true,
        },
      });

      await interaction.editReply({
        content: `✅ Configured! Native: ${nativeLabel} → Target: ${targetLabel}`,
        components: [],
      });
    } catch (error) {
      // Handle timeout or other errors
      if (error instanceof Error && error.message.includes("timeout")) {
        await interaction.editReply({
          content:
            "⏰ Setup timed out. Please run `/setup` again when you're ready.",
          components: [],
        });
        return;
      }
      throw error;
    }
  },
};
