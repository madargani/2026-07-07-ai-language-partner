import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "./setup.js";

vi.mock("../services/fsrs.js", () => ({
  getDueItems: vi.fn(),
  rateItem: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("discord.js", async () => {
  const actual = await vi.importActual("discord.js");
  return {
    ...actual,
    ActionRowBuilder: actual.ActionRowBuilder,
    ButtonBuilder: actual.ButtonBuilder,
    ButtonStyle: actual.ButtonStyle,
    ComponentType: actual.ComponentType,
    EmbedBuilder: actual.EmbedBuilder,
    MessageFlags: actual.MessageFlags,
    SlashCommandBuilder: actual.SlashCommandBuilder,
  };
});

import { getDueItems, rateItem } from "../services/fsrs.js";
import type { ChatInputCommandInteraction } from "discord.js";

function createMockInteraction() {
  const mockAwaitComponent = vi.fn();
  return {
    user: { id: "discord-user-1" },
    channel: {
      awaitMessageComponent: mockAwaitComponent,
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    __mockAwaitComponent: mockAwaitComponent,
  } as unknown as ChatInputCommandInteraction & {
    __mockAwaitComponent: ReturnType<typeof vi.fn>;
  };
}

const configuredUser = {
  id: "user-1",
  configured: true,
  targetLanguage: "fr",
  nativeLanguage: "en",
};

describe("Review Command — /review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires user to be configured", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const interaction = createMockInteraction();
    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.stringContaining("setup"),
    );
  });

  it("shows no-items-due message when queue is empty", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue([]);

    const interaction = createMockInteraction();
    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: "No Items Due",
            }),
          }),
        ]),
      }),
    );
  });
});

describe("Review Command — showReviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders first card with correct embed fields", async () => {
    const mockItems = [
      { id: "item-1", source: "bonjour", type: "vocabulary", language: "fr" },
      { id: "item-2", source: "merci", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_good_item-1",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(rateItem).mockResolvedValue({} as any);

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    const calls = vi.mocked(interaction.editReply).mock.calls;
    const cardCall = calls.find(
      ([args]: any) =>
        args?.embeds?.[0]?.data?.title?.includes("Review 1 of 2"),
    );
    expect(cardCall).toBeDefined();
    const cardCallArgs = cardCall![0] as any;
    expect(cardCallArgs.components?.length).toBeGreaterThanOrEqual(2);
  });

  it("displays four FSRS rating buttons (Again/Hard/Good/Easy) plus Exit button", async () => {
    const mockItems = [
      { id: "item-1", source: "salut", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_good_item-1",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(rateItem).mockResolvedValue({} as any);

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    const calls = vi.mocked(interaction.editReply).mock.calls;
    const cardCall = calls.find(
      ([args]: any) => args?.embeds?.[0]?.data?.title?.includes("Review"),
    );
    expect(cardCall).toBeDefined();
    const cardCallArgs = cardCall![0] as any;
    const components: any[] = cardCallArgs.components ?? [];
    expect(components.length).toBeGreaterThanOrEqual(2);

    const allButtons = components.flatMap(
      (row: any) => row.components ?? [],
    );
    expect(allButtons.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Review Command — Rating Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Again button calls rateItem with rating 1 and advances to next card", async () => {
    const mockItems = [
      { id: "item-a1", source: "bonjour", type: "vocabulary", language: "fr" },
      { id: "item-a2", source: "merci", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);
    vi.mocked(rateItem).mockResolvedValue({} as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_again_item-a1",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    expect(vi.mocked(rateItem)).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-a1", rating: 1 }),
    );

    // After first rating, should show second card
    const allEditReplyCalls = vi.mocked(interaction.editReply).mock.calls;
    const secondCardCall = allEditReplyCalls.find(
      ([args]: any) =>
        args?.embeds?.[0]?.data?.title?.includes("Review 2 of 2"),
    );
    expect(secondCardCall).toBeDefined();
  });

  it("Easy button calls rateItem with rating 4", async () => {
    const mockItems = [
      { id: "item-e1", source: "bonjour", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);
    vi.mocked(rateItem).mockResolvedValue({} as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_easy_item-e1",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    expect(vi.mocked(rateItem)).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "item-e1", rating: 4 }),
    );
  });

  it("Exit button ends review with progress summary", async () => {
    const mockItems = [
      { id: "item-x1", source: "test", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_exit",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    const finalCalls = vi.mocked(interaction.editReply).mock.calls;
    const exitCall = finalCalls.find(
      ([args]: any) =>
        args?.embeds?.[0]?.data?.title === "Review Session Ended",
    );
    expect(exitCall).toBeDefined();
  });
});

describe("Review Command — Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("timeout shows expired session message", async () => {
    const mockItems = [
      { id: "item-t1", source: "test", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockRejectedValue(
      new Error("Collector received no interactions before ending with reason: time"),
    );

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    const finalCalls = vi.mocked(interaction.editReply).mock.calls;
    const timeoutCall = finalCalls.find(
      ([args]: any) =>
        args?.embeds?.[0]?.data?.title === "Review Session Expired",
    );
    expect(timeoutCall).toBeDefined();
  });

  it("completes all items with celebration message", async () => {
    const mockItems = [
      { id: "item-c1", source: "test", type: "vocabulary", language: "fr" },
    ];

    mockPrisma.user.findUnique.mockResolvedValue(configuredUser);
    vi.mocked(getDueItems).mockResolvedValue(mockItems as any);
    vi.mocked(rateItem).mockResolvedValue({} as any);

    const interaction = createMockInteraction();
    interaction.__mockAwaitComponent.mockResolvedValue({
      customId: "review_good_item-c1",
      user: { id: "discord-user-1" },
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    });

    const { command } = await import("../commands/review.js");
    await command.execute(interaction);

    const finalCalls = vi.mocked(interaction.editReply).mock.calls;
    const completeCall = finalCalls.find(
      ([args]: any) =>
        args?.embeds?.[0]?.data?.title === "Review Complete!",
    );
    expect(completeCall).toBeDefined();
  });
});
