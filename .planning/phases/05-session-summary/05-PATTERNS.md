# Phase 5: Session Summary — Pattern Map

**Mapped:** 2026-07-21
**Files analyzed:** 7 (3 modified models/services, 2 enhanced commands, 1 new prompt, 1 test setup)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `prisma/schema.prisma` | model | data-definition | Existing `ReviewItem` & `Session` models | exact (same file) |
| `src/services/fsrs.ts` | service | CRUD | Existing `getDueItems()` in same file | exact (same file) |
| `src/services/extraction.ts` | service | event-driven | Existing `processExtractionJob()` in same file | exact (same file) |
| `src/services/conversation.ts` | service | request-response | Existing `getSessionSummary()` + `summarizer.ts` | role-match |
| `src/commands/summary.ts` | controller | request-response | Existing `summary.ts` + `review.ts` | exact (same file) |
| `src/__tests__/setup.ts` | test | config | Existing mock patterns in same file | exact (same file) |
| `prompts/conversation/strengths.md` | utility | static-config | `prompts/conversation/summarize.md` | role-match |

---

## Pattern Assignments

### `prisma/schema.prisma` (model, data-definition)

**Changes:** Add optional `sessionId` FK on ReviewItem. Add new `SessionSummary` model with 1:1 relation to Session.

**Analog:** Existing ReviewItem model + Session model in same file.

**Existing model patterns** (lines 22-38, 40-51, 53-73):
```prisma
// Session model — pattern for relation definition, indexes, timestamps
model Session {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  discordThreadId String    @unique
  status          String    @default("active")
  summary         String?
  messageCount    Int       @default(0)
  correctionCount Int       @default(0)
  createdAt       DateTime  @default(now())
  endedAt         DateTime?
  updatedAt       DateTime  @updatedAt
  messages        Message[]

  @@index([userId])
  @@index([status])
}

// Message model — pattern for FK relation + index on FK
model Message {
  id             String   @id @default(uuid())
  sessionId      String
  session        Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  role           String
  content        String
  hasCorrections Boolean  @default(false)
  createdAt      DateTime @default(now())

  @@index([sessionId])
  @@index([createdAt])
}

// ReviewItem — pattern for the sessionId FK field to add (line 54+)
model ReviewItem {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  source        String
  type          String   // "vocabulary" | "grammar"
  language      String
  // ... FSRS fields ...
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
  @@index([userId, due])
}

// New SessionSummary follows the same conventions:
// - @id @default(uuid()) for primary key (line 54)
// - sessionId String @unique for 1:1 relation (line 23 discordThreadId @unique)
// - Session @relation(fields: [sessionId], references: [id], onDelete: Cascade) (line 43, Message pattern)
// - strengths Json? for flexible JSON (line 28 summary String?)
// - createdAt @default(now()) and updatedAt @updatedAt (lines 31-32, 68-69)
// - @@index([sessionId]) (line 49, Message pattern)
```

---

### `src/services/fsrs.ts` (service, CRUD)

**Changes:** Add optional `sessionId` to `CreateItemInput`. Add `getQueueHealth()` function. Optionally extend `getDueItems()` with time-window filter.

**Analog:** Existing file itself — `createItem()`, `getDueItems()`.

**Type/interface pattern** (lines 14-19, 21-24):
```typescript
// Existing interface pattern — add sessionId field
export interface CreateItemInput {
  userId: string;
  source: string;
  type: ItemType;
  language: string;
  // NEW: sessionId?: string; — add as optional field
}

export interface RateItemInput {
  itemId: string;
  rating: RatingValue;
}
```

**Service function pattern** (lines 32-52):
```typescript
// createItem() — pattern for new getQueueHealth()
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
      // ... spread rest
    },
  });
}
```

**Existing getDueItems() — pattern for getQueueHealth()** (lines 110-118):
```typescript
// Reuse this query structure for queue health
export async function getDueItems(userId: string) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: { lte: new Date() },
    },
    orderBy: { due: "asc" },
  });
}

// New getQueueHealth() follows the findMany pattern but uses count() and gte/lte:
// export async function getQueueHealth(userId: string): Promise<number> {
//   const now = new Date();
//   const twentyFourHoursLater = new Date(now.getTime() + 24 * 60 * 60 * 1000);
//   return prisma.reviewItem.count({
//     where: {
//       userId,
//       due: { gte: now, lte: twentyFourHoursLater },
//     },
//   });
// }
```

**Import pattern** (lines 1-2):
```typescript
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { prisma } from "../lib/prisma.js";
```

---

### `src/services/extraction.ts` (service, event-driven)

**Changes:** Pass `data.sessionId` to `createItem()` call.

**Analog:** Existing `processExtractionJob()` in same file — minimal pass-through change.

**Existing extraction flow** (lines 56-80):
```typescript
// Inside processExtractionJob() — pattern for sessionId stamping
for (const item of parsed.detectedItems) {
  try {
    const existing = await prisma.reviewItem.findFirst({
      where: {
        userId: data.userId,
        source: item.source,
        type: item.type,
      },
    });

    if (existing) {
      console.log("Skipping duplicate item:", item.source, item.type);
      continue;      // ← D-07: NO sessionId stamping on dedup skip
    }

    await createItem({
      userId: data.userId,
      source: item.source,
      type: item.type,
      language: data.targetLanguage,
      // NEW: sessionId: data.sessionId, — stamp from job payload
    });
  } catch (err) {
    console.error("Failed to create item:", item.source, err);
  }
}
```

**Import and file setup pattern** (lines 1-18):
```typescript
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { createItem } from "./fsrs.js";
import { ExtractionResultSchema, type ExtractionJobPayload } from "../types/extraction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(
  join(__dirname, "..", "prompts", "extraction", "system.md"),
  "utf-8",
);

const openai = new OpenAI();
```

---

### `src/services/conversation.ts` (service, request-response)

**Changes:** Extend `getSessionSummary()` return type with `strengths`, `expandedCount`, `queueHealth`, `sessionId`. Add strength analysis LLM call (modeled on summarizer.ts). Enhance `endSession()` with Prisma `$transaction` for SessionSummary creation.

**Analog:** Existing `getSessionSummary()` return type pattern + `summarizer.ts` LLM call pattern.

**Existing return type pattern** (lines 333-340):
```typescript
// Extend this return type with new fields
export async function getSessionSummary(
  userId: string,
): Promise<{
  messageCount: number;
  correctionCount: number;
  summary: string;
  duration: string;
  // NEW FIELDS:
  // strengths: Array<{ term: string; explanation: string }>;
  // expandedCount: number;
  // queueHealth: number;
  // sessionId: string;
} | null> {
```

**Existing summarizer.ts LLM call pattern** (lines 40-70 in `summarizer.ts`):
```typescript
// Pattern for strength analysis — read prompt, fetch messages, call LLM, parse
const messages = await prisma.message.findMany({
  where: { sessionId },
  orderBy: { createdAt: "asc" },
});

const conversationText = messages
  .map((m) => `${m.role}: ${m.content}`)
  .join("\n");

const completion = await openai.chat.completions.create({
  model: env.CONVERSATION_MODEL,  // or hardcoded "gpt-4o-mini" per summarizer.ts pattern
  messages: [
    { role: "system", content: strengthsPrompt },
    { role: "user", content: conversationText },
  ],
  response_format: { type: "json_object" },
  max_tokens: 500,
});
```

**Existing prompt loading pattern** (lines 1-6, 24-27 in conversation.ts and summarizer.ts):
```typescript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "system.md"),
  "utf-8",
);
```

**Existing endSession() pattern** (lines 294-331):
```typescript
// Enhance with $transaction for SessionSummary creation
export async function endSession(userId: string): Promise<{
  sessionId: string;
  stats: { messageCount: number; correctionCount: number };
} | null> {
  for (const [threadId, session] of activeSessions) {
    if (session.userId === userId) {
      activeSessions.delete(threadId);

      // Wrap in $transaction with SessionSummary creation:
      // const [updatedSession] = await prisma.$transaction([
      //   prisma.session.update({
      //     where: { id: session.id },
      //     data: { status: "ended", endedAt: new Date(), ... },
      //   }),
      //   prisma.sessionSummary.create({
      //     data: { sessionId: session.id, strengths, expandedCount, queueHealth, summary },
      //   }),
      // ]);

      await prisma.session.update({
        where: { id: session.id },
        data: {
          status: "ended",
          endedAt: new Date(),
          messageCount: session.messageCount,
          correctionCount: session.correctionCount,
        },
      });

      // Move thread archive AFTER the transaction per Pitfall 5
      try {
        await session.thread.setArchived(true);
      } catch {
        // Thread may already be archived
      }

      return {
        sessionId: session.id,
        stats: { messageCount: session.messageCount, correctionCount: session.correctionCount },
      };
    }
  }
  return null;
}
```

**Existing Prisma count pattern** (from messageCreate.ts and extraction.ts):
```typescript
// Pattern for expansion metrics count
const expandedCount = await prisma.reviewItem.count({
  where: { sessionId: session.id },
});

// Pattern for queue health query (or use new getQueueHealth() from fsrs.ts)
const queueHealth = await prisma.reviewItem.count({
  where: {
    userId: user.id,
    due: {
      gte: new Date(),
      lte: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
});
```

**Error handling pattern for LLM parsing** (from extraction.ts lines 44-50):
```typescript
// Wrap strength parsing in try/catch with fallback
const completion = await openai.chat.completions.create({
  model: env.CONVERSATION_MODEL,
  messages: [...],
  response_format: { type: "json_object" },
  max_tokens: 500,
});

try {
  const strengths = JSON.parse(completion.choices[0]?.message?.content ?? "[]");
} catch {
  const strengths = []; // Fallback: empty strengths
}
```

---

### `src/commands/summary.ts` (controller, request-response)

**Changes:** Enhance embed with strengths, expansion metrics, and queue health fields alongside existing fields.

**Analog:** Existing `summary.ts` embed pattern + `review.ts` embed pattern.

**Existing embed pattern** (lines 28-44):
```typescript
// Enhance with new fields between Duration and Summary
const embed = new EmbedBuilder()
  .setColor(0x3498db)
  .setTitle("📊 Session Summary")
  .addFields(
    // Existing — keep as-is
    { name: "Messages", value: String(summary.messageCount), inline: true },
    { name: "Corrections", value: String(summary.correctionCount), inline: true },
    { name: "Duration", value: summary.duration, inline: true },

    // NEW: separator (existing pattern from conversation.ts line 108)
    { name: "\u200B", value: "\u200B", inline: false },

    // NEW: Strengths (top 3) — follow existing value pattern using String()
    // Use Array.map with inline formatting, fallback text if empty
    { name: "🏆 Top Strengths", value: summary.strengths
      .map((s, i) => `**${i + 1}. ${s.term}** — ${s.explanation}`)
      .join("\n") || "Session too short to analyze.", inline: false },

    // NEW: Expansion metrics
    { name: "📈 New Items", value: `${summary.expandedCount} extracted`, inline: true },

    // NEW: Queue health
    { name: "📚 Queue", value: `${summary.queueHealth} due in 24h`, inline: true },

    // separator before summary
    { name: "\u200B", value: "\u200B", inline: false },
  )
  .setTimestamp();

// Existing conditional summary field (lines 42-44)
if (summary.summary) {
  embed.addFields({ name: "Summary", value: summary.summary });
}
```

**DeferReply + editReply pattern** (lines 14-16, 46):
```typescript
async execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // ... fetch and build ...
  await interaction.editReply({ embeds: [embed] });
}
```

**Import pattern** (lines 1-7):
```typescript
import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { endSession, getSessionSummary } from "../services/conversation.js";
import type { Command } from "../types/discord.js";
```

---

### `src/__tests__/setup.ts` (test, config)

**Changes:** Add `count` method to `reviewItem` mock. Add `sessionSummary` block with `create`, `findUnique`, `findMany` methods.

**Analog:** Existing mock patterns in the same file.

**Existing reviewItem mock pattern** (lines 26-32, 53-59):
```typescript
// In the PrismaMock type — add count and sessionSummary:
type PrismaMock = {
  user: { findUnique: ...; upsert: ... };
  session: { create: ...; findUnique: ...; findMany: ...; update: ...; deleteMany: ... };
  message: { create: ...; createMany: ...; findMany: ...; deleteMany: ... };
  reviewItem: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    // NEW: count: ReturnType<typeof vi.fn>;
  };
  // NEW: sessionSummary: {
  //   create: ReturnType<typeof vi.fn>;
  //   findUnique: ReturnType<typeof vi.fn>;
  //   findMany: ReturnType<typeof vi.fn>;
  // };
  $disconnect: ...;
  $connect: ...;
  $on: ...;
};
```

**Existing mock values pattern** (lines 35-63):
```typescript
// Add count and sessionSummary alongside existing mocks
const mock: PrismaMock = {
  user: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue(null) },
  session: {
    create: vi.fn().mockResolvedValue({ id: "session-1", status: "active", discordThreadId: "thread-1" }),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  message: {
    create: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  reviewItem: {
    create: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
    // NEW: count: vi.fn().mockResolvedValue(0),
  },
  // NEW: sessionSummary: {
  //   create: vi.fn().mockResolvedValue({ id: "ss-1", sessionId: "session-1" }),
  //   findUnique: vi.fn().mockResolvedValue(null),
  //   findMany: vi.fn().mockResolvedValue([]),
  // },
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $connect: vi.fn().mockResolvedValue(undefined),
  $on: vi.fn(),
} as any;
```

---

### `prompts/conversation/strengths.md` (utility, static-config)

**New file:** LLM prompt for strength analysis at `/summary` time.

**Analog:** `prompts/conversation/summarize.md` — same directory, similar structure (concise system prompt with output rules).

**Existing summarize prompt pattern** (`prompts/conversation/summarize.md`):
```markdown
Summarize the following conversation. Focus on: topics discussed, the user's apparent language level,
vocabulary used, grammatical patterns observed, and any recurring errors.

Keep the summary under 500 tokens. Write in English.

Format: plain text summary (no structure, just a running narrative).
```

**Existing extraction prompt pattern** (`prompts/extraction/system.md`):
```markdown
You are an extraction assistant for a language learning app. The user is learning {{targetLanguage}}
and their native language is {{nativeLanguage}}.

Analyze the user's message and extract vocabulary and grammar items worth practicing. Follow these rules:

1. Extract vocabulary items ...
2. ... (numbered rules, concise)
```

**Strengths prompt pattern to follow (based on D-03 output format):**
```markdown
Analyze the following language learning conversation. Identify the top 3 specific vocabulary or grammar
areas where the user demonstrated good understanding.

For each strength, provide:
- `term`: The specific vocabulary word, grammar concept, or language pattern (e.g. "Preterite tense",
  "Restaurant vocabulary", "Ser vs Estar")
- `explanation`: A brief explanation of how the user handled it correctly (e.g. "Used 'comí' and
  'bebiste' correctly in context")

Output as a JSON array of objects with `term` and `explanation` fields. Return exactly 3 strengths,
or fewer if the conversation is too short to analyze meaningfully.

Write the explanation in English.
```

---

## Shared Patterns

### Authentication / Guard Pattern
**Source:** `src/commands/review.ts` lines 155-160, `src/commands/new.ts` lines 24-33
**Apply to:** All command files check user exists and is configured before proceeding
```typescript
const user = await prisma.user.findUnique({
  where: { discordId: interaction.user.id },
});

if (!user?.configured) {
  await interaction.editReply("Please run `/setup` first.");
  return;
}
```
**Note:** summary.ts currently does NOT check `user?.configured` — it only checks if `getSessionSummary` returns null. This is acceptable since the user must have an active session (created via `/new` which requires setup).

### DeferReply First Pattern
**Source:** `src/commands/summary.ts` line 15, `src/commands/review.ts` line 148, `src/commands/new.ts` line 22
**Apply to:** All command `execute()` handlers
```typescript
async execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  // ... rest of handler
}
```

### Prisma PrismaClient Singleton
**Source:** `src/lib/prisma.ts` lines 1-16
**Apply to:** All service files use this shared instance
```typescript
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") { globalForPrisma.prisma = prisma; }
```

### LLM Call Pattern
**Source:** `src/services/summarizer.ts` lines 54-61, `src/services/conversation.ts` lines 198-213, `src/services/extraction.ts` lines 33-42
**Apply to:** Strength analysis in conversation.ts
```typescript
const completion = await openai.chat.completions.create({
  model: env.CONVERSATION_MODEL,
  messages: [
    { role: "system", content: prompt },
    { role: "user", content: input },
  ],
  response_format: { type: "json_object" },  // for structured JSON output
  max_tokens: 500,
});
```

### Embed Color Convention
**Source:** `src/commands/summary.ts` line 29 (blue=0x3498db), `src/commands/review.ts` line 23 (green=0x2ecc71), line 40 (purple=0x9b59b6), `src/services/conversation.ts` lines 106,110
**Apply to:** Summary embed uses 0x3498db (blue) — keep existing color
- Summary: `0x3498db` (blue)
- Review cards: `0x9b59b6` (purple)
- No items / success: `0x2ecc71` (green)
- Corrections: `0xe67e22` (orange)
- No errors: `0x2ecc71` (green)

### Prompt File Loading Pattern
**Source:** `src/services/conversation.ts` lines 21-27, `src/services/summarizer.ts` lines 9-13, `src/services/extraction.ts` lines 14-18
**Apply to:** Strength analysis prompt loading in conversation.ts
```typescript
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const strengthsPrompt = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "strengths.md"),
  "utf-8",
);
```

### Thread Archive After Data Persistence
**Source:** `src/services/conversation.ts` lines 314-318
**Apply to:** Enhanced endSession() — archive thread AFTER Prisma $transaction
```typescript
// Thread archive is best-effort — ignore errors
try {
  await session.thread.setArchived(true);
} catch {
  // Thread may already be archived
}
```

### Error Handling Pattern — LLM Calls
**Source:** `src/services/extraction.ts` lines 44-50 (LLM refusal), `src/commands/review.ts` lines 150-183 (command-level try/catch)
**Apply to:** Strength analysis call (wrap in try/catch with fallback)
```typescript
try {
  const completion = await openai.chat.completions.create({ ... });
  // parse response
} catch (err) {
  console.error("Failed to analyze strengths:", err);
  // Return empty strengths array — UI shows "Strengths analysis unavailable"
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | All 7 files have close analogs |

---

## Metadata

**Analog search scope:** `src/commands/`, `src/services/`, `src/events/`, `src/types/`, `src/lib/`, `prisma/`, `src/__tests__/`, `src/prompts/`, `vitest.config.ts`
**Files scanned:** 13 source files + 2 context files
**Pattern extraction date:** 2026-07-21
