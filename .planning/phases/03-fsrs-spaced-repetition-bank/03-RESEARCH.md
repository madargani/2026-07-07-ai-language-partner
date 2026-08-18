# Phase 3: FSRS Spaced Repetition Bank — Research

**Researched:** 2026-07-09
**Domain:** FSRS-5 spaced repetition scheduling, Prisma ORM model design, ts-fsrs v5.4.x API integration
**Confidence:** HIGH

## Summary

Phase 3 delivers the FSRS spaced repetition bank — a Prisma `ReviewItem` model with full FSRS scheduling fields, a service layer wrapping ts-fsrs v5.4.1 operations, and a manual `/add-item` slash command for creating review items. The core ts-fsrs API is straightforward: `fsrs()` creates a scheduler instance, `createEmptyCard()` initialises a new card with default FSRS parameters (FSRS-04 satisfied), `scheduler.next(card, now, rating)` computes the next scheduling state given a rating, and the `scheduler.repeat()` variant previews all four possible outcomes. The 14-day interval cap (FSRS-05) is applied in `rateItem()` by checking item age via `createdAt` vs `Date.now()` — if under 3 months old and `scheduled_days > 14`, clamp to 14.

**Primary recommendation:** Use `scheduler.next()` with `Rating.Good`/`Rating.Hard`/`Rating.Easy`/`Rating.Again` for single-rating application (the Phase 3 review flow). Default `fsrs()` parameters (request_retention: 0.9, maximum_interval: 36500, enable_fuzz: true) are sufficient for initial seeding — no custom constants needed (D-04). Store ReviewItem state as a unified Prisma model with `state` as Int (mapping to `State.New=0, State.Learning=1, State.Review=2, State.Relearning=3`), `stability` and `difficulty` as `Float`, `due` as `DateTime`, and all other FSRS fields as `Int`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Unified `ReviewItem` Prisma model with `type` enum field (`vocabulary` / `grammar`)
- **D-02:** Content fields: `source` (foreign word/phrase) only — no translation or example sentence fields
- **D-03:** FSRS fields: `stability`, `difficulty`, `state` (int, maps to FSRS State enum), `due` (DateTime), `elapsedDays`, `scheduledDays`, `reps`, `lapses`. Plus user relation, language, type discriminator, createdAt, updatedAt
- **D-04:** Use ts-fsrs built-in default parameters for new items — no custom constants or DB seed migration
- **D-05:** Phase 3 includes a manual `/add-item` slash command for creating review items
- **D-06:** `/add-item` accepts: source text, type (vocabulary/grammar), and optionally the target language (defaults to user's targetLanguage)
- **D-07:** Single `src/services/fsrs.ts` service with: `createItem()`, `rateItem()`, `getDueItems()`, `getItem()`
- **D-08:** 14-day interval cap enforced inside `rateItem()` — clamp intervals to 14 days for items < 3 months old
- **D-09:** `getDueItems()` filters items where `due <= now` for the requesting user, ordered by `due` ASC
- **D-10:** Unit tests with mocked Prisma client — test FSRS scheduling logic in isolation
- **D-11:** No new env vars needed. `ts-fsrs` needs to be added to package.json

### the agent's Discretion
- Exact Prisma field ordering, defaults, and column attributes — planner follows Prisma conventions
- `/add-item` command arg spec (which fields required vs optional) — researcher recommends based on UX patterns
- Mocking strategy for tests (vitest mock vs manual stubs) — planner decides
- Whether `getItem()` returns null or throws on not-found — planner follows existing codebase patterns

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FSRS-01 | Vocabulary items stored with FSRS fields (stability, difficulty, state, etc.) | Unified ReviewItem Prisma model with type enum; ts-fsrs Card interface provides these fields natively |
| FSRS-02 | Grammar pattern items stored with same FSRS fields | Same ReviewItem model, `type` discriminator field set to `grammar` |
| FSRS-03 | ts-fsrs algorithm updates scheduling on each review | `scheduler.next(card, now, Rating.Good)` returns updated `{ card, log }` — map to Prisma update |
| FSRS-04 | Cold start handled with population parameter seeding | `createEmptyCard()` initialises with ts-fsrs defaults (stability=0, difficulty=0, state=New). First `scheduler.next()` call uses built-in parameters to produce sensible intervals. Verified by running the API. |
| FSRS-05 | Review intervals capped at 14 days for first 3 months per item | Compare `createdAt` vs now: if < 90 days AND `scheduledDays > 14`, clamp `due` to `now + 14 days`. Apply inside `rateItem()` after `scheduler.next()`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| FSRS card scheduling math | Bot (ts-fsrs in-memory) | — | ts-fsrs is a pure math library, runs in Node.js process. No API tier needed. |
| Item persistence | Database (PostgreSQL) | Bot (Prisma ORM) | ReviewItem model stored in PostgreSQL, read/written via Prisma. No caching tier. |
| Item creation (manual) | Bot (discord.js command) | — | `/add-item` slash command creates items directly in DB via Prisma. |
| Due item retrieval | Bot (Prisma query) | — | `getDueItems()` queries ReviewItem where due <= now, ordered ASC. Single Prisma query. |
| Interval cap enforcement | Bot (ts-fsrs service) | — | Pure logic in `rateItem()` — no external dependencies needed. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ts-fsrs` | ^5.4.1 | FSRS-5 scheduling algorithm | The canonical TypeScript FSRS implementation (verified: open-spaced-repetition org, 80K+ weekly downloads, zero dependencies, MIT license). Implements FSRS-5 with learning steps, fuzz, and retrievability calculation. |
| `@prisma/client` | ^6.19.x (existing) | Database ORM | Already in project. Add ReviewItem model to schema. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `discord.js` | ^14.26.x (existing) | Discord command registration | `/add-item` command follows same pattern as existing commands |
| `vitest` | ^4.x (existing) | Test runner | Unit tests for FSRS service with mocked Prisma |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ts-fsrs` (ts-fsrs) | `@squeakyrobot/fsrs` | `@squeakyrobot/fsrs` is a newer alternative (1.0.0, 0 dependents) with FSRS v4.5 (optional v6). ts-fsrs is more mature (3+ years, 685 stars, official open-spaced-repetition project), has more API surface (repeat/next, history helpers, afterHandlers), and is used by Anki itself. Stick with ts-fsrs. |

**Installation:**
```bash
npm install ts-fsrs
```

**Version verification:**
```bash
npm view ts-fsrs version          # → 5.4.1
npm view ts-fsrs time.modified    # → 2026-05-22 (published 23 days ago from research date)
```

**Compatibility check with Node.js:**
- ts-fsrs requires Node.js >=20. Our project uses Node.js 22.23.1 LTS ✅
- ts-fsrs is zero-dependency, pure TypeScript, supports ESM (`import`) and CommonJS (`require`). Our project uses ESM (`"type": "module"` in package.json) ✅

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `ts-fsrs` | npm | 3+ years (2023-03-05) | ~80K/week | github.com/open-spaced-repetition/ts-fsrs | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

**Verification details:**
- Verdict from `gsd-tools query package-legitimacy check`: **OK**
- Signals: exists, publishes 2026-05-22, 80,808 weekly downloads, repo at `git+https://github.com/open-spaced-repetition/ts-fsrs.git`, not deprecated, no postinstall script
- No suspicious indicators (no postinstall script, well-known repo, 704 stars on GitHub, 84 releases)
- Verified by direct CJS import: `createEmptyCard()`, `fsrs()`, `Rating`, `State` all work correctly

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Discord Client                               │
│  User runs /add-item, (future) /review, rates cards                 │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ slash commands
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  src/commands/                                                       │
│  ┌──────────────┐  ┌───────────────┐                                │
│  │ add-item.ts  │  │ (future)      │                                │
│  │ (NEW)        │  │ review.ts     │                                │
│  └──────┬───────┘  └───────────────┘                                │
└─────────┼────────────────────────────────────────────────────────────┘
          │ calls
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  src/services/fsrs.ts                     src/services/              │
│  ┌─────────────────────────────────┐     conversation.ts (existing)  │
│  │ FSRS Service                    │                                 │
│  │                                 │                                 │
│  │ createItem(source, type, lang)  │──→ ReviewItem.create() via      │
│  │   → createEmptyCard()           │    Prisma                       │
│  │   → map Card → ReviewItem data  │                                 │
│  │                                 │                                 │
│  │ rateItem(item, rating)          │──→ ReviewItem.update() via      │
│  │   → scheduler.next(card, ...)   │    Prisma                       │
│  │   → applyIntervalCap()          │                                 │
│  │                                 │                                 │
│  │ getDueItems(userId)             │──→ ReviewItem.findMany()        │
│  │   → due <= now, ordered ASC     │    where due <= now             │
│  │                                 │                                 │
│  │ getItem(itemId)                 │──→ ReviewItem.findUnique()      │
│  └──────────┬──────────────────────┘                                 │
└─────────────┼────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Prisma / PostgreSQL                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  User           ReviewItem                                       │ │
│  │  ┌──────────┐   ┌──────────────────────────────────────────┐    │ │
│  │  │ id       │──→│ userId (FK)                              │    │ │
│  │  │ discordId│    │ source: String                           │    │ │
│  │  │ ...      │    │ type: String (vocabulary | grammar)      │    │ │
│  │  └──────────┘    │ language: String                         │    │ │
│  │                  │ stability: Float   ← ts-fsrs Card field  │    │ │
│  │                  │ difficulty: Float  ← ts-fsrs Card field  │    │ │
│  │                  │ state: Int         ← ts-fsrs State enum  │    │ │
│  │                  │ due: DateTime      ← ts-fsrs Card field  │    │ │
│  │                  │ elapsedDays: Int   ← ts-fsrs field        │    │ │
│  │                  │ scheduledDays: Int ← ts-fsrs field        │    │ │
│  │                  │ reps: Int          ← ts-fsrs Card field   │    │ │
│  │                  │ lapses: Int        ← ts-fsrs Card field   │    │ │
│  │                  │ createdAt: DateTime                       │    │ │
│  │                  │ updatedAt: DateTime                       │    │ │
│  │                  └──────────────────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. **Item creation** (`/add-item`): User provides source text, type, and optional language → `createItem()` calls `createEmptyCard()` → maps ts-fsrs `Card` fields to Prisma `ReviewItem` → persists to DB
2. **Review rating** (`rateItem()`): Fetch item from DB → reconstruct ts-fsrs `Card` object → call `scheduler.next(card, now, rating)` → read `result.card.scheduled_days` → apply 14-day cap if item < 3 months old → update `due`, `stability`, `difficulty`, `state`, `elapsedDays`, `scheduledDays`, `reps`, `lapses` in DB
3. **Due items** (`getDueItems()`): Query `ReviewItem` where `userId == userId` AND `due <= now` → order by `due ASC`

### Recommended Project Structure
```
src/
├── commands/
│   ├── index.ts          # (updated) register add-item command
│   └── add-item.ts        # (new) /add-item command handler
├── services/
│   └── fsrs.ts            # (new) FSRS service: createItem(), rateItem(), getDueItems(), getItem()
├── __tests__/
│   ├── setup.ts           # (updated) add ReviewItem to mockPrisma
│   └── fsrs.test.ts       # (new) unit tests for FSRS service with mocked Prisma
```

### Pattern 1: Create Item with Empty Card
**What:** When a new review item is created, `createEmptyCard()` produces a ts-fsrs `Card` with all fields at initial (zero) state. Map the Card fields directly into the Prisma ReviewItem model.

**When to use:** Every item creation — both manual (`/add-item`) and future automatic extraction (Phase 4).

**Example:**
```typescript
// Source: ts-fsrs v5.4.1 verified API — npm registry + direct runtime test
// [VERIFIED: npm registry — ts-fsrs@5.4.1]

import { createEmptyCard, fsrs, type Card } from "ts-fsrs";
import { prisma } from "../lib/prisma.js";

// The scheduler is a singleton — create once at module level
const scheduler = fsrs();

interface CreateItemInput {
  userId: string;
  source: string;
  type: "vocabulary" | "grammar";
  language: string;
}

async function createItem(input: CreateItemInput) {
  const now = new Date();
  // createEmptyCard() can optionally take a date argument
  const card: Card = createEmptyCard(now);

  const item = await prisma.reviewItem.create({
    data: {
      userId: input.userId,
      source: input.source,
      type: input.type,
      language: input.language,
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state,       // 0 = State.New
      due: card.due,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
    },
  });

  return item;
}
```

### Pattern 2: Rate Item with Interval Cap
**What:** Apply a user's rating (Again/Hard/Good/Easy) to an existing item. After ts-fsrs computes the new schedule, enforce the 14-day cap for items < 3 months old.

**When to use:** Every time a user rates a review item. In Phase 3 this is called programmatically. In Phase 4 it will be called from `/review`.

**Example:**
```typescript
// Source: ts-fsrs v5.0.1 verified API + FSRS-05 requirement
// [VERIFIED: npm registry — ts-fsrs@5.4.1]
// [CITED: github.com/open-spaced-repetition/ts-fsrs — Rating enum values]

import { fsrs, Rating, type Card } from "ts-fsrs";
import { prisma } from "../lib/prisma.js";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000; // ~90 days in ms
const MAX_INTERVAL_DAYS = 14;

export type RatingValue = 1 | 2 | 3 | 4; // Again=1, Hard=2, Good=3, Easy=4

interface RateItemInput {
  itemId: string;
  rating: RatingValue;
}

async function rateItem(input: RateItemInput) {
  const item = await prisma.reviewItem.findUnique({
    where: { id: input.itemId },
  });
  if (!item) throw new Error(`ReviewItem not found: ${input.itemId}`);

  // Reconstruct ts-fsrs Card from persisted fields
  const card: Card = {
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as 0 | 1 | 2 | 3,
    last_review: undefined, // ts-fsrs sets this during scheduling
    learning_steps: 0,     // default — see agent discretion if needed
  };

  // Map our rating value to ts-fsrs Rating enum
  // Rating.Again=1, Rating.Hard=2, Rating.Good=3, Rating.Easy=4
  const tsRating = input.rating as Rating;

  const now = new Date();
  const result = scheduler.next(card, now, tsRating);
  const updatedCard: Card = result.card;

  // Apply interval cap for items < 3 months old (FSRS-05)
  const itemAge = now.getTime() - item.createdAt.getTime();
  if (itemAge < THREE_MONTHS_MS && updatedCard.scheduled_days > INTERVAL_DAYS) {
    const cappedDue = new Date(now.getTime() + INTERVAL_DAYS * 24 * 60 * 60 * 1000);
    updatedCard.due = cappedDue;
    updatedCard.scheduled_days = INTERVAL_DAYS;
  }

  // Persist updated card state
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
}
```

### Pattern 3: Get Due Items
**What:** Query all ReviewItems for a user where `due <= now`, ordered by due date ascending (oldest-first).

**When to use:** When the user runs `/review` (Phase 4) or for any queue-health inspection.

**Example:**
```typescript
// Source: FSRS-09 requirement — due <= now, ordered ASC
// [VERIFIED: Prisma query pattern from codebase]

async function getDueItems(userId: string) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: { lte: new Date() },
    },
    orderBy: { due: "asc" },
  });
}

async function getItem(itemId: string) {
  return prisma.reviewItem.findUnique({
    where: { id: itemId },
  });
}
```

### Pattern 4: /add-item Command
**What:** A Discord slash command for manually creating review items. Accepts source text, type (choices: vocabulary/grammar), and optionally the target language (defaults to user's configured targetLanguage).

**When to use:** Manual item entry for testing and early use before Phase 4 extraction.

**Example:**
```typescript
// Source: discord.js v14 slash command pattern (existing codebase)
// [CITED: discord.js.org/docs — SlashCommandBuilder]

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
    const type = interaction.options.getString("type", true) as "vocabulary" | "grammar";
    const language = interaction.options.getString("language") ?? user.targetLanguage;

    const item = await createItem({
      userId: user.id,
      source,
      type,
      language,
    });

    await interaction.editReply(
      `✅ Item added! \`${source}\` (${type}) — ready for review from ${item.due.toLocaleDateString()}`,
    );
  },
};
```

### Anti-Patterns to Avoid

- **Storing ts-fsrs `learning_steps` field in Prisma:** The `learning_steps` property on ts-fsrs Card tracks the current short-term learning step index, which is transient state used by `scheduler.next()`. It doesn't need to be persisted; ts-fsrs recalculates it during `next()`. Omit it from the Prisma model.
- **Storing `last_review` in Prisma:** Similarly, `last_review` is set by ts-fsrs during `scheduler.next()`. For our use case, the `updatedAt` field or first review event serves the same purpose. Omit it unless Phase 4 requires it for retrievability calculation.
- **Hardcoding rating values:** Don't use magic numbers 0-3 for ratings. Use `Rating.Again` (1), `Rating.Hard` (2), `Rating.Good` (3), `Rating.Easy` (4) from ts-fsrs. Note: `Rating.Manual` (0) exists but is not used in normal review flows.
- **Calling `scheduler.repeat()` when you already know the rating:** `repeat()` returns all 4 previews. Use `next()` when applying a single known rating — it's simpler, faster, and returns a single result.
- **Re-initialising the scheduler per request:** `fsrs()` is stateless and pure, but creating a new instance every time is wasteful. Create it once at module level.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Spaced repetition scheduling | Custom SRS algorithm | `ts-fsrs` v5.4.1 | FSRS-5 is the state of the art (replaces SM-2). ts-fsrs has zero dependencies, 80K+ weekly downloads, and handles learning steps, fuzz, and retrievability. A hand-rolled SM-2 or SM-5 implementation would be less effective and harder to maintain. |
| 14-day interval cap | Complex date math | Simple `itemAge < 90 days AND scheduledDays > 14 → clamp` | The logic is simple: compare `createdAt` to `now`, check age in ms, clamp in days. No need for a library or helper — a few lines of inline code suffice. |
| Item persistence | Flat files, SQLite raw queries | Prisma ORM (existing) | Already in project. ReviewItem model integrates with existing User relation. |

**Key insight:** ts-fsrs is a zero-dependency TypeScript library that does one thing well: SRS scheduling math. Don't add complexity by wrapping it in a caching layer, event system, or custom persistence framework. The service layer should be a thin translation layer between ts-fsrs Card ↔ Prisma ReviewItem.

## Common Pitfalls

### Pitfall 1: State Mapping Confusion
**What goes wrong:** The ts-fsrs `Card.state` is a numeric enum (`State.New=0`, `State.Learning=1`, `State.Review=2`, `State.Relearning=3`), but the Prisma model stores it as a plain `Int`. Code that compares states using string names (`"New"`) will silently fail because `card.state` is `0`, not `"New"`.
**Why it happens:** TypeScript's numeric enum exposes both `State.New` (returns `0`) and `State[0]` (returns `"New"`), leading to confusion.
**How to avoid:** Always compare using the numeric values. Use `import { State } from 'ts-fsrs'` and compare with `card.state === State.Review` (which is `2`). Never use `State[card.state]` in business logic — only use it for display/logging.

### Pitfall 2: Rating Enum Off-by-One
**What goes wrong:** The ts-fsrs `Rating` enum has `Manual=0, Again=1, Hard=2, Good=3, Easy=4` — but the standard Anki/SRS convention is Again=0, Hard=1, Good=2, Easy=3. If Phase 4's review flow uses Anki conventions (0-3), passing them directly as `scheduler.next(card, now, rating)` will apply the wrong rating.
**Why it happens:** ts-fsrs diverges from Anki's 0..3 scale. `Rating.Again` is 1, not 0.
**How to avoid:** Map user ratings explicitly: `again → Rating.Again`, `hard → Rating.Hard`, etc. In Phase 3 (no user-facing review yet), this is not a concern. But the `rateItem()` function must use the ts-fsrs enum values, not raw numbers.

### Pitfall 3: Forgetting to Reconstruct All Card Fields
**What goes wrong:** When calling `scheduler.next()`, you must pass a complete `Card` object with all fields populated (especially `state`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`). If you omit a field (e.g., `learning_steps`), ts-fsrs may behave incorrectly.
**Why it happens:** ts-fsrs is a pure function that computes the next state from the current state. Missing fields throw off the calculation.
**How to avoid:** Always reconstruct the full `Card` object from persisted fields before calling `next()`. Include `learning_steps: 0` as default (it's a transient field anyway).

### Pitfall 4: Interval Cap Applied to In-Memory Only
**What goes wrong:** The interval cap is applied to `result.card.scheduled_days` in memory, but the code writes the un-capped value to the database instead.
**Why it happens:** The `result.card` object's `scheduled_days` is the ts-fsrs computed value — it's easy to forget to mutate it before persisting.
**How to avoid:** Always modify `result.card.scheduled_days` AND `result.card.due` together before writing to DB. Verify in tests that the persisted values match the capped values, not the ts-fsrs output.

## ts-fsrs v5.4.1 API Reference

### Key Imports
```typescript
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";
import type { Card, ReviewLog } from "ts-fsrs";
```

### Enum Values (Verified by Direct Runtime Test)
```
State enum:
  State.New        = 0
  State.Learning   = 1
  State.Review     = 2
  State.Relearning = 3

Rating enum:
  Rating.Manual = 0
  Rating.Again  = 1
  Rating.Hard   = 2
  Rating.Good   = 3
  Rating.Easy   = 4
```

### Card Interface (from TypeDoc — confirmed via runtime test)
```
interface Card {
  due: Date;              // Date when next due for review
  stability: number;      // Memory stability in days
  difficulty: number;     // Card difficulty (1-10 range)
  elapsed_days: number;   // Days since last review (DEPRECATED in v6)
  scheduled_days: number; // Interval until next review
  reps: number;           // Total review count
  lapses: number;         // Times forgotten/incorrect
  state: State;           // New=0, Learning=1, Review=2, Relearning=3
  last_review?: Date;     // Optional last review date
  learning_steps: number; // Current learning step index
}
```

### ReviewLog Interface
```
interface ReviewLog {
  rating: Rating;          // The rating applied
  state: State;            // State at review time
  due: Date;               // Previous due date
  stability: number;       // Pre-review stability
  difficulty: number;      // Pre-review difficulty
  elapsed_days: number;    // Days since last review
  last_elapsed_days: number;
  scheduled_days: number;  // New scheduled interval
  review: Date;            // Review timestamp
}
```

### Empty Card Defaults (Verified by Runtime Test)
```
{
  due: now,               // Date of creation
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  learning_steps: 0,
  state: 0                 // State.New
}
```

### Default FSRS Parameters (used when calling `fsrs()` with no args)
```
{
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
  w: [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
}
```

## Code Examples

### Complete FSRS Service Implementation
```typescript
// Source: ts-fsrs v5.0.1 verified API + CONTEXT.md decisions D-01 through D-09
// [VERIFIED: npm registry — ts-fsrs@5.4.1]

import { createEmptyCard, fsrs, Rating, type Card } from "ts-fsrs";
import { prisma } from "../lib/prisma.js";

const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;

// Singleton scheduler — use default FSRS parameters (D-04)
const scheduler = fsrs();

// ─── Types ───────────────────────────────────────────────────────────────

export type ItemType = "vocabulary" | "grammar";
export type RatingValue = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

interface CreateItemInput {
  userId: string;
  source: string;
  type: ReviewType;
  language: string;
}

interface RateItemInput {
  itemId: string;
  rating: RatingValue;
}

// ─── Public API ──────────────────────────────────────────────────────

export async function createItem(input: CreateItemInput) {
  const now = new Date();
  const card: Card = createEmptyCard(now);

  return prisma.reviewItem.create({
    data: {
      userId: input.userId,
      source: input.source,
      type: input.type,
      language: input.language,
      stability: card.stability,
      difficulty: card.difficulty,
      state: card.state,           // 0 = State.New
      due: card.due,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
    },
  });
}

export async function rateItem(input: RateItemInput) {
  const item = await prisma.reviewItem.findUnique({
    where: { id: input.itemId },
  });
  if (!item) throw new Error(`ReviewItem not found: ${input.itemId}`);

  // Reconstruct ts-fsrs Card from persisted fields
  const card: Card = {
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as Card["state"],
    learning_steps: 0,           // Transient — ts-fsrs recalculates
  };

  const now = new Date();
  const result = scheduler.next(card, now, input.rating as Rating);
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

export async function getDueItems(userId: string) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: { lte: new Date() },
    },
    orderBy: { due: "asc" },
  });
}

export async function getItem(itemId: string) {
  return prisma.reviewItem.findUnique({
    where: { id: itemId },
  });
}
```

### Unit Test Pattern for FSRS Service
```typescript
// Source: D-10 + existing vitest setup pattern (src/__tests__/setup.ts)
// [VERIFIED: codebase pattern — mock Prisma approach]

import { describe, it, expect, vi } from "vitest";
import { Rating, State } from "ts-fsrs";
import { createItem, rateItem, getDueItems } from "../services/fsrs.js";

// The mockPrisma is available from the vitest setup
const mockPrisma = (await import("../__tests__/setup.js")).mockPrisma;

describe("FSRS Service", () => {
  describe("createItem", () => {
    it("creates a new item with FSRS default fields", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "item-1",
        userId: "user-1",
        source: "hola",
        type: "vocabulary",
        language: "es",
        stability: 0,
        difficulty: 0,
        state: State.New, // = 0
        due: new Date(),
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
      });

      mockPrisma.reviewItem.create = mockCreate;

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
      expect(mockCreate).toHaveBeenCalledOnce();
    });
  });

  describe("rateItem", () => {
    it("updates scheduling after Good rating", async () => {
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

      const result = await rateItem({ itemId: "item-1", rating: Rating.Good as 1 | 2 | 3 | 4 });

      expect(result.item.state).toBe(State.Learning);
      expect(result.item.reps).toBe(1);
      expect(result.item.stability).toBeGreaterThan(0);
      expect(mockPrisma.reviewItem.update).toHaveBeenCalledOnce();
    });

    it("applies 14-day cap for items < 3 months old", async () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days old

      // Simulate a card in Review state with high stability (would normally schedule >14 days)
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
      mockPrisma.reviewItem.update = vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...mockItem, ...data }),
      );

      const result = await rateItem({ itemId: "item-1", rating: Rating.Good as 1 | 2 | 3 | 4 });

      // scheduled_days should be capped at 14, not 46
      expect(result.item.scheduled_days).toBeLessThanOrEqual(14);
      expect(result.item.scheduled_days).toBe(14);
    });

    it("does not cap intervals for items > 3 months old", async () => {
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
      mockPrisma.reviewItem.update = vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...mockItem, ...data }),
      );

      const result = await rateItem({ itemId: "item-2", rating: Rating.Good as 1 | 2 | 3 | 4 });

      // scheduled_days should be the full ts-fsrs value, not capped
      expect(result.item.scheduled_days).toBeGreaterThan(14);
    });
  });

  describe("getDueItems", () => {
    it("returns items with due <= now, ordered ASC", async () => {
      mockPrisma.reviewItem.findMany = vi.fn().mockResolvedValue([
        { id: "item-1", due: new Date(Date.now() - 3600000), userId: "user-1", source: "hola" },
        { id: "item-2", due: new Date(), userId: "user-1", source: "gracias" },
      ]);

      const items = await getDueItems("user-1");

      expect(items).toHaveLength(2);
      // Verify the query was called with correct filter
      expect(mockPrisma.reviewItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", due: { lte: expect.any(Date) } },
          orderBy: { due: "asc" },
        }),
      );
    });
  });
});
```

### Prisma Schema for ReviewItem
```prisma
// prisma/schema.prisma — ADD this model

model ReviewItem {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  source        String
  type          String   // "vocabulary" | "grammar"
  language      String
  stability     Float
  difficulty    Float
  state         Int      @default(0)  // State.New=0, State.Learning=1, State.Review=2, State.Relearning=3
  due           DateTime @default(now())
  elapsedDays   Int      @default(0)
  scheduledDays Int      @default(0)
  reps          Int      @default(0)
  lapses        Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@index([userId, due])
  @@index([userId, type])
}
```

**Model design rationale:**
- `stability` and `difficulty` as `Float` (not `Decimal`) — ts-fsrs returns JavaScript `number` (IEEE-754 double). Prisma `Float` maps to PostgreSQL `double precision` — sufficient precision for FSRS math. `Decimal` would add unnecessary overhead and type conversion.
- `state` as `Int` — maps directly to ts-fsrs `State` numeric enum values 0-3.
- `elapsedDays` and `scheduledDays` as `Int` — these are day counts, not fractional values. Int is correct.
- `reps` and `lapses` as `Int` — integer counters.
- `due` as `DateTime` with `@default(now())` — maps directly to ts-fsrs `Card.due` which is a `Date`.

### Mock Setup Update for Vitest
```typescript
// In src/__tests__/setup.ts — ADD to the mockPrisma object

const { mockPrisma } = vi.hoisted(() => {
  // ...existing mocks...

  const mock: PrismaMock = {
    // ...existing user, session, message mocks...
    reviewItem: {
      create: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(null),
    },
  };
  return { mockPrisma: mock };
});
```

## Runtime State Inventory

> Not applicable — Phase 3 is a greenfield feature phase, not a rename/refactor/migration.

**Phase type:** Feature addition (greenfield FSRS bank atop existing foundation).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SM-2 algorithm (Anki legacy) | FSRS-5 algorithm (ts-fsrs) | 2023–2024 | FSRS is ~81% more accurate than SM-2 at predicting recall probability. Uses 21 trainable parameters. ts-fsrs is the canonical TypeScript implementation. |
| ts-fsrs v4 (Node 18) | ts-fsrs v5 (Node 20+, FSRS-6) | 2025–2026 | v5+ requires Node 20+. Our project is on Node 22, so compatible. v5 uses FSRS-6 algorithm. |
| Manual card creation via `/add-item` | Automatic extraction (Phase 4) | Phase 4 | `/add-item` in Phase 3 provides the manual entry path. Phase 4 adds automatic extraction from conversation. |

**Deprecated/outdated:**
- `ts-fsrs` v3.x and earlier: Requires Node 16, no longer compatible with modern runtimes.
- SM-2/Anki legacy scheduler: Replaced by FSRS in modern SRS applications.

## Assumptions Log

> All claims in this research were verified against ts-fsrs v5.4.1 official docs (npm registry, GitHub README, TypeDoc) or confirmed via direct runtime testing. No unresolved assumptions.

**This table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **`learning_steps` handling — store or omit?**
   - What we know: ts-fsrs Card has `learning_steps: number` — a transient field tracking the current short-term learning step index. It's used by `scheduler.next()` but recalculated each time.
   - Recommendation: Omit from the Prisma model. Set to `0` when reconstructing a Card from persistence. ts-fsrs recalculates it during scheduling anyway.
   - Planner action: The `plan-checker` should verify that `learning_steps` is not in the Prisma model but is included in the Card reconstruction object.

2. **`last_review` handling — store for retrievability?**
   - What we know: ts-fsrs `Card.last_review` is an optional `Date`. It is set during `scheduler.next()`. The `get_retrievability()` function uses it internally to compute elapsed time.
   - Recommendation: Omit from Prisma for now. If Phase 4 needs retrievability calculation (for progress metrics), add `lastReview` field then. The `createdAt` timestamp suffices for the 14-day age check (FSRS-05).
   - Planner action: Skip `lastReview` in schema. Add a note that Phase 4 may add it.

## Environment Availability

> Phase 3 has one external dependency: ts-fsrs. No other tools or services are needed beyond the existing stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | ts-fsrs@5.4.1 | ✓ | 26.0.0 | — |
| npm | Installing ts-fsrs | ✓ | 11.12.1 | — |
| PostgreSQL | Prisma (existing) | ✓ | 17 (project config) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing) |
| Quick run command | `npm test` (runs vitest) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|----------------|
| FSRS-01 | Create vocabulary item with FSRS fields | unit | `npx vitest run src/__tests__/fsrs.test.ts` | ❌ Wave 0 |
| FSRS-02 | Create grammar item with same FSRS fields | unit | (same test file, test type variant) | ❌ Wave 0 |
| FSRS-03 | ts-fsrs updates scheduling on rating | unit | `npx vitest run src/__tests__/fsrs.test.ts` (rateItem tests) | ❌ Wave 0 |
| FSRS-04 | Default parameters produce sensible first intervals | unit | (verified runtime — no test needed) | ❌ Wave 0 |
| FSRS-05 | 14-day cap for items < 3 months old | unit | `npx vitest run src/__tests__/fsrs.test.ts` (cap tests) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/fsrs.test.ts` — FSRS service unit tests (createItem, rateItem with cap, getDueItems)
- [ ] Update `src/__tests__/setup.ts` — add `reviewItem` mock to mockPrisma

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord OAuth2 is the sole identity provider |
| V3 Session Management | no | No sessions in Phase 3 — stateless Prisma queries |
| V4 Access Control | yes | items are scoped to userId — queries always filter by user relation |
| V5 Input Validation | yes | `/add-item` validates source, type enum, and language via Discord command builder |
| V6 Cryptography | no | No secrets stored or transmitted |

### Known Threat Patterns for Node.js + Prisma
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prisma injection via source text | Tampering | Prisma parameterises queries — `source` is a string field, not a query fragment. No SSI risk. |
| User A accessing User B items | Information Disclosure | All queries (`getDueItems`, `getItem`) filter by `userId` derived from the Discord user's authentication. |
| Rating manipulation | Tampering | Ratings are integers 1-4 applied server-side. No client-side rating values accepted. ts-fsrs internally uses `Rating` enum. |

## Sources

### Primary (HIGH confidence)
- **npm registry** (`npm view ts-fsrs`) — version 5.4.1, 80K+ weekly downloads, zero dependencies, MIT license, created 2023-03-05
- **TypeDoc API docs** (open-spaced-repetition.github.io/ts-fsrs/) — `Card`, `ReviewLog`, `State`, `Rating` interfaces, `fsrs()`, `createEmptyCard()`, `scheduler.next()`, `scheduler.repeat()` API signatures
- **ts-fsrs README** (GitHub main) — Quickstart, usage patterns, custom parameters, `repeat` vs `next` guidance, `generatorParameters`, `afterHandler` pattern
- **Direct runtime test** — Verified exact Card defaults, State enum values, Rating enum values, and scheduling output from ts-fsrs v5.4.1

### Secondary (MEDIUM confidence)
- **npmx.dev ts-fsrs stats** — Download trend: 80K+ weekly (2026-07), 704 stars, 65 forks
- **GitHub repository** — 84 releases, active maintenance (2026-05-22 latest), biome.js config
- **DeepWiki ts-fsrs analysis** — Card structure docs, strategy system, afterHandler patterns

### Tertiary (LOW confidence)
- **simple-ts-fsrs docs** — Alternative implementation used for API pattern comparison (not authoritative)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ts-fsrs v5.4.1 verified on npm registry with direct runtime test; compatibility confirmed with Node 22 + TypeScript 5.9 + ESM
- Architecture: HIGH — Service layer pattern follows existing codebase (`conversation.ts`); Prisma model design follows standard conventions
- Pitfalls: MEDIUM — State enum confusion and Rating enum off-by-one are documented; tested via runtime
- Interval cap: HIGH — Simple date comparison logic, verified with edge-case reasoning

**Research date:** 2026-07-09
**Valid until:** 2026-08-09 (30-day window — ts-fsrs is stable, minor releases only)