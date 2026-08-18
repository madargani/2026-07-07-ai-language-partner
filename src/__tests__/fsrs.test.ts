import { describe, expect, it, vi } from "vitest";
import { Rating, State } from "ts-fsrs";
import { mockPrisma } from "./setup.js";

describe("FSRS Service — createItem", () => {
  it("creates a vocabulary item with FSRS default fields", async () => {
    const { createItem } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.create = vi.fn().mockResolvedValue({
      id: "item-1",
      userId: "user-1",
      source: "hola",
      type: "vocabulary",
      language: "es",
      stability: 0,
      difficulty: 0,
      state: State.New,
      due: new Date(),
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
    });

    const item = await createItem({
      userId: "user-1",
      source: "hola",
      type: "vocabulary",
      language: "es",
    });

    expect(item.state).toBe(State.New);
    expect(item.stability).toBe(0);
    expect(item.difficulty).toBe(0);
    expect(item.reps).toBe(0);
    expect(item.lapses).toBe(0);
    expect(mockPrisma.reviewItem.create).toHaveBeenCalledOnce();
  });

  it("creates a grammar item with FSRS default fields", async () => {
    const { createItem } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.create = vi.fn().mockResolvedValue({
      id: "item-2",
      userId: "user-1",
      source: "subject-verb-object",
      type: "grammar",
      language: "es",
      stability: 0,
      difficulty: 0,
      state: State.New,
      due: new Date(),
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
    });

    const item = await createItem({
      userId: "user-1",
      source: "subject-verb-object",
      type: "grammar",
      language: "es",
    });

    expect(item.state).toBe(State.New);
    expect(item.stability).toBe(0);
    expect(item.difficulty).toBe(0);
    expect(item.reps).toBe(0);
    expect(item.lapses).toBe(0);
    expect(item.type).toBe("grammar");
    expect(mockPrisma.reviewItem.create).toHaveBeenCalledOnce();
  });
});

describe("FSRS Service — rateItem", () => {
  it("updates scheduling after Good rating", async () => {
    const { rateItem } = await import("../services/fsrs.js");

    const now = new Date();
    const createdAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

    const mockItem = {
      id: "item-1",
      userId: "user-1",
      source: "hola",
      type: "vocabulary",
      language: "es",
      stability: 0,
      difficulty: 0,
      state: State.New,
      due: now,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      createdAt,
      updatedAt: now,
    };

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue(mockItem);
    mockPrisma.reviewItem.update = vi.fn().mockResolvedValue({
      ...mockItem,
      stability: 2.3065,
      difficulty: 2.118,
      state: State.Learning,
      reps: 1,
    });

    const result = await rateItem({
      itemId: "item-1",
      rating: Rating.Good as 1 | 2 | 3 | 4,
    });

    expect(result.item.state).toBe(State.Learning);
    expect(result.item.reps).toBe(1);
    expect(result.item.stability).toBeGreaterThan(0);
    expect(mockPrisma.reviewItem.update).toHaveBeenCalledOnce();
  });

  it("applies 14-day cap for items < 3 months old", async () => {
    const { rateItem } = await import("../services/fsrs.js");

    const now = new Date();
    const createdAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days old

    // Simulate a card in Review state with high stability
    const mockItem = {
      id: "item-1",
      userId: "user-1",
      source: "hola",
      type: "vocabulary",
      language: "es",
      stability: 45,
      difficulty: 5,
      state: State.Review,
      due: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      elapsedDays: 60,
      scheduledDays: 60,
      reps: 3,
      lapses: 0,
      createdAt,
      updatedAt: now,
    };

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue(mockItem);
    mockPrisma.reviewItem.update = vi
      .fn()
      .mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...mockItem, ...data }),
      );

    const result = await rateItem({
      itemId: "item-1",
      rating: Rating.Good as 1 | 2 | 3 | 4,
    });

    // scheduled_days should be capped at 14, not the ts-fsrs computed value
    expect(result.item.scheduled_days).toBeLessThanOrEqual(14);
    expect(result.item.scheduled_days).toBe(14);
  });

  it("does not cap intervals for items > 3 months old", async () => {
    const { rateItem } = await import("../services/fsrs.js");

    const now = new Date();
    const createdAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days old

    const mockItem = {
      id: "item-2",
      userId: "user-1",
      source: "gracias",
      type: "vocabulary",
      language: "es",
      stability: 45,
      difficulty: 5,
      state: State.Review,
      due: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      elapsedDays: 60,
      scheduledDays: 60,
      reps: 3,
      lapses: 0,
      createdAt,
      updatedAt: now,
    };

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue(mockItem);
    mockPrisma.reviewItem.update = vi
      .fn()
      .mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...mockItem, ...data }),
      );

    const result = await rateItem({
      itemId: "item-2",
      rating: Rating.Good as 1 | 2 | 3 | 4,
    });

    // scheduled_days should be the full ts-fsrs value, not capped
    expect(result.item.scheduled_days).toBeGreaterThan(14);
  });

  it("throws when item is not found", async () => {
    const { rateItem } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue(null);

    await expect(
      rateItem({ itemId: "nonexistent", rating: Rating.Good as 1 | 2 | 3 | 4 }),
    ).rejects.toThrow(/not found/);
  });
});

describe("FSRS Service — getDueItems", () => {
  it("returns items with due <= now, ordered ASC", async () => {
    const { getDueItems } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.findMany = vi.fn().mockResolvedValue([
      {
        id: "item-1",
        due: new Date(Date.now() - 3600000),
        userId: "user-1",
        source: "hola",
      },
      {
        id: "item-2",
        due: new Date(),
        userId: "user-1",
        source: "gracias",
      },
    ]);

    const items = await getDueItems("user-1");

    expect(items).toHaveLength(2);
    expect(mockPrisma.reviewItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", due: { lte: expect.any(Date) } },
        orderBy: { due: "asc" },
      }),
    );
  });
});

describe("FSRS Service — getItem", () => {
  it("returns item by ID", async () => {
    const { getItem } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue({
      id: "item-1",
      source: "hola",
    });

    const result = await getItem("item-1");

    expect(result?.id).toBe("item-1");
    expect(mockPrisma.reviewItem.findUnique).toHaveBeenCalledWith({
      where: { id: "item-1" },
    });
  });

  it("returns null when item not found", async () => {
    const { getItem } = await import("../services/fsrs.js");

    mockPrisma.reviewItem.findUnique = vi.fn().mockResolvedValue(null);

    const result = await getItem("nonexistent");

    expect(result).toBeNull();
  });
});
