import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { prisma } from "../lib/prisma.js";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

// Singleton scheduler — use default FSRS parameters (D-04)
const scheduler = fsrs();

// ─── Types ───────────────────────────────────────────────────────────────

export type ItemType = "vocabulary" | "grammar";
export type RatingValue = 1 | 2 | 3 | 4; // Again=1, Hard=2, Good=3, Easy=4

export interface CreateItemInput {
  userId: string;
  source: string;
  type: ItemType;
  language: string;
  sessionId?: string;       // per D-06: optional FK to Session
}

export interface RateItemInput {
  itemId: string;
  rating: RatingValue;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Creates a new review item with ts-fsrs default scheduling fields.
 * Uses createEmptyCard() for initial FSRS state (stability=0, difficulty=0, State.New).
 */
export async function createItem(input: CreateItemInput) {
  const now = new Date();
  const card: Card = createEmptyCard(now);

  return prisma.reviewItem.create({
    data: {
      userId: input.userId,
      source: input.source,
      type: input.type,
      language: input.language,
      sessionId: input.sessionId,  // per D-06: passes undefined if absent
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state, // 0 = State.New
      due: card.due,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
    },
  });
}

/**
 * Applies a rating (Again/Hard/Good/Easy) to an existing review item.
 * Reconstructs the ts-fsrs Card from persisted fields, computes new scheduling,
 * and enforces a 14-day interval cap for items under 3 months old (FSRS-05).
 */
export async function rateItem(input: RateItemInput) {
  const item = await prisma.reviewItem.findUnique({
    where: { id: input.itemId },
  });

  if (!item) throw new Error(`ReviewItem not found: ${input.itemId}`);

  // Reconstruct ts-fsrs Card from persisted fields (Pitfall 3 anti-pattern avoidance)
  const card: Card = {
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as Card["state"],
    learning_steps: 0, // Transient — ts-fsrs recalculates during next()
  };

  const now = new Date();
  const result = scheduler.next(card, now, input.rating as Grade);
  const updatedCard: Card = result.card;

  // FSRS-05: 14-day cap for items < 3 months old
  const itemAge = now.getTime() - item.createdAt.getTime();
  if (itemAge < THREE_MONTHS_MS && updatedCard.scheduled_days > 14) {
    updatedCard.scheduled_days = 14;
    updatedCard.due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  }

  await prisma.reviewItem.update({
    where: { id: input.itemId },
    data: {
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      state: updatedCard.state,
      due: updatedCard.due,
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: updatedCard.scheduled_days,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
    },
  });

  return { item: updatedCard, reviewLog: result.log };
}

/**
 * Returns all review items for a user where due <= now, ordered by due ASC.
 */
export async function getDueItems(userId: string) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: { lte: new Date() },
    },
    orderBy: { due: "asc" },
  });
}

/**
 * Returns a single review item by ID, or null if not found.
 */
export async function getItem(itemId: string) {
  return prisma.reviewItem.findUnique({
    where: { id: itemId },
  });
}

/**
 * Returns the count of ReviewItems due within the next 24 hours for a user.
 * Used by the summary command to display queue health.
 */
export async function getQueueHealth(userId: string): Promise<number> {
  const now = new Date();
  const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return prisma.reviewItem.count({
    where: {
      userId,
      due: {
        gte: now,
        lte: twentyFourHoursLater,
      },
    },
  });
}
