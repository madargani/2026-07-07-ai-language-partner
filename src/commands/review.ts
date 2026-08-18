import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../lib/prisma.js";
import { getDueItems, rateItem } from "../services/fsrs.js";
import type { Command } from "../types/discord.js";

async function showReviewCard(
  interaction: any,
  items: any[],
  index: number,
  targetLang: string,
  nativeLang: string,
): Promise<void> {
  if (index >= items.length) {
    const completeEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("Review Complete!")
      .setDescription(`You reviewed all ${items.length} items.`);

    await interaction.editReply({ embeds: [completeEmbed], components: [] });
    return;
  }

  const item = items[index];
  const promptTypes = [
    `Use '${item.source}' in a ${targetLang} sentence.`,
    `Complete: The word '${item.source}' best fits which blank?`,
    `How do you say '${item.source}' in ${nativeLang}?`,
  ];
  const prompt = promptTypes[index % 3];

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`Review ${index + 1} of ${items.length}`)
    .addFields(
      { name: "Item", value: `${item.source} (${item.type})`, inline: true },
      { name: "Prompt Type", value: prompt, inline: false },
    )
    .setFooter({ text: "Rate how well you remembered this item" });

  const againBtn = new ButtonBuilder()
    .setCustomId(`review_again_${item.id}`)
    .setLabel("Again")
    .setStyle(ButtonStyle.Danger);
  const hardBtn = new ButtonBuilder()
    .setCustomId(`review_hard_${item.id}`)
    .setLabel("Hard")
    .setStyle(ButtonStyle.Danger);
  const goodBtn = new ButtonBuilder()
    .setCustomId(`review_good_${item.id}`)
    .setLabel("Good")
    .setStyle(ButtonStyle.Success);
  const easyBtn = new ButtonBuilder()
    .setCustomId(`review_easy_${item.id}`)
    .setLabel("Easy")
    .setStyle(ButtonStyle.Success);
  const exitBtn = new ButtonBuilder()
    .setCustomId("review_exit")
    .setLabel("Exit")
    .setStyle(ButtonStyle.Secondary);

  const ratingRow =
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      againBtn,
      hardBtn,
      goodBtn,
      easyBtn,
    );
  const exitRow =
    new ActionRowBuilder<ButtonBuilder>().addComponents(exitBtn);

  await interaction.editReply({
    embeds: [embed],
    components: [ratingRow, exitRow],
  });

  try {
    const buttonInteraction = await interaction.channel!.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i: any) =>
        i.user.id === interaction.user.id &&
        (i.customId.startsWith("review_") || i.customId === "review_exit"),
      time: 120_000,
    });

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === "review_exit") {
      const exitEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("Review Session Ended")
        .setDescription(`You reviewed ${index} of ${items.length} items.`);

      await interaction.editReply({
        embeds: [exitEmbed],
        components: [],
      });
      return;
    }

    const ratingMap: Record<string, 1 | 2 | 3 | 4> = {
      review_again: 1,
      review_hard: 2,
      review_good: 3,
      review_easy: 4,
    };

    const prefix = buttonInteraction.customId.replace(
      /_[a-zA-Z0-9-]+$/,
      "",
    );
    const rating = ratingMap[prefix] ?? 3;

    await rateItem({ itemId: item.id, rating });

    await showReviewCard(interaction, items, index + 1, targetLang, nativeLang);
  } catch (error: any) {
    if (error?.message?.includes?.("time")) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("Review Session Expired")
        .setDescription("Run /review again to continue.");

      await interaction.editReply({
        embeds: [timeoutEmbed],
        components: [],
      });
      return;
    }
    throw error;
  }
}

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription(
      "Review due vocabulary and grammar items with spaced repetition",
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const user = await prisma.user.findUnique({
        where: { discordId: interaction.user.id },
      });

      if (!user?.configured) {
        await interaction.editReply(
          "Please run `/setup` first.",
        );
        return;
      }

      const items = await getDueItems(user.id);

      if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle("No Items Due")
          .setDescription("You have no items due for review. Great job!");

        await interaction.editReply({ embeds: [emptyEmbed], components: [] });
        return;
      }

      await showReviewCard(
        interaction,
        items,
        0,
        user.targetLanguage,
        user.nativeLanguage,
      );
    } catch (error) {
      console.error("Failed to execute /review:", error);
      await interaction.editReply(
        "An error occurred while starting your review session.",
      );
    }
  },
};
