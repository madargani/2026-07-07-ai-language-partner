# Phase 4: Extraction & Review — Research

**Researched:** 2026-07-20
**Domain:** Background LLM extraction pipeline (BullMQ/Redis + OpenAI structured output), Discord.js button-based review flow, FSRS integration
**Confidence:** HIGH

## Summary

Phase 4 delivers two connected subsystems: (1) a background extraction pipeline that enqueues user messages to a BullMQ queue after conversation responses complete, processes them through GPT-4o-mini with Zod-typed structured output (`zodResponseFormat`), and persists detected vocabulary/grammar items via the existing FSRS `createItem()` service; and (2) a `/review` slash command that presents due cards with FSRS rating buttons (Again/Hard/Good/Easy) using Discord's `ActionRowBuilder` + `ButtonBuilder` + message component collectors, updating schedules via `rateItem()` after each rating.

The extraction pipeline uses OpenAI's native structured output (`response_format: zodResponseFormat(...)`) for guaranteed schema compliance — `zodResponseFormat` converts a Zod schema to JSON Schema, and the model is constrained via finite-state machine token masking to 100% schema-valid output. No manual JSON parsing or retry-on-malformed-response needed. The review flow uses a channel-based `MessageComponentCollector` attached to the interaction's ephemeral response, enabling a recursive card-by-card flow without requiring global interaction handlers or database cursor state.

**Primary recommendation:** Three files + two modifications: `src/lib/queue.ts` (BullMQ connection + queue singleton + worker), `src/services/extraction.ts` (prompt + LLM call + `createItem` persistence), `src/commands/review.ts` (button-based review command). Modify `src/events/messageCreate.ts` to enqueue after conversation response. Modify `src/index.ts` to initialize worker and add shutdown cleanup.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use OpenAI `gpt-4o-mini` (the `EXTRACTION_MODEL` env var) for the extraction pipeline. No new LLM provider SDK.
- **D-02:** Extraction fires **after** the conversation response completes. `handleConversationMessage` returns, then the user's message is enqueued to BullMQ.
- **D-03:** Single BullMQ queue named `"extraction"` with concurrency set to `1`.
- **D-04:** Job payload includes: `userId`, `sessionId`, `messageContent`, `targetLanguage`, `nativeLanguage`, `recentContext` (last 2-3 messages). Worker has everything needed without extra DB queries.
- **D-05:** Retry: 3 attempts with exponential backoff (1s, 5s, 25s). Failed jobs route to a dead-letter queue for manual inspection.
- **D-06:** Structured output shape: `{ detectedItems: { source: string, type: "vocabulary" | "grammar" }[], typosIgnored: string[] }`
- **D-07:** Each detected item carries only `source` + `type` — no contextSnippet, confidence score, or suggested translation. Matches the existing ReviewItem model.
- **D-08:** Mechanical typos (user knows the word, mistyped) → `typosIgnored` array. Cognitive mistakes (wrong word, incorrect grammar) → `detectedItems` for practice. Distinction is LLM-prompt driven.
- **D-09:** When a native-language term appears in target-language chat, the extracted ReviewItem stores the **target-language equivalent** as `source`. The LLM infers the intended target-language term.
- **D-10:** Extraction prompt explicitly receives `nativeLanguage` + `targetLanguage` from the user profile in the job payload.

### the agent's Discretion
- BullMQ connection setup (`src/lib/queue.ts`) and worker structure
- Extraction system prompt content
- Error handling within the extraction worker (LLM call failures, parsing failures)
- Whether to batch multiple pending extraction jobs into one LLM call on the worker side
- `/review` command UX: embed design, button labels (Again/Hard/Good/Easy), prompt type rotation, exit behavior, empty queue handling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXTR-01 | User input passed to low-tier LLM (GPT-4o-mini) after conversation response | Post-response enqueue from `messageCreate.ts` → BullMQ job → worker call to OpenAI |
| EXTR-02 | Extraction output conforms to Zod schema (detectedItems, typosIgnored) | `zodResponseFormat(ExtractionSchema, "extraction")` enforces 100% schema-valid output via constrained decoding |
| EXTR-03 | Semantic filtering: cognitive mistakes vs mechanical typos | LLM-prompt driven distinction; `typosIgnored` vs `detectedItems` in schema |
| EXTR-04 | Code-switching detection: native terms → target-language equivalent | Prompt engineering with `nativeLanguage` + `targetLanguage` in system prompt; LLM infers target-language term |
| EXTR-05 | Extracted items update FSRS metrics in PostgreSQL | Worker calls `createItem()` from `src/services/fsrs.ts` for each detected item |
| EXTR-06 | Extraction pipeline runs via BullMQ/Redis for backpressure | Single `"extraction"` queue, concurrency=1, Redis-backed, 3 retries with exponential backoff |
| REVW-01 | User can run `/review` to fetch items where nextReview <= now | `getDueItems()` from FSRS service; command presents first card |
| REVW-02 | Review prompts: use-in-sentence, fill-in-blank, native-translation | LLM-generated prompts in `/review` command (agent's discretion for design) |
| REVW-03 | User response rated on FSRS scale (Again/Hard/Good/Easy) | ButtonBuilder with 4 custom_id values; calls `rateItem()` on button click |
| REVW-04 | Rating feeds into ts-fsrs scheduler and updates next review date | `rateItem()` from `src/services/fsrs.ts` called on each button click |
| REVW-05 | Review flow recurses until queue clear or user exits via button | Channel-based MessageComponentCollector with recursive `showNextCard()`; exit button terminates collector |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Extraction LLM call | Bot (OpenAI SDK) | — | GPT-4o-mini called directly from Node.js worker via OpenAI SDK v6. No API tier. |
| Background job queue | Bot (BullMQ + Redis) | — | BullMQ queue runs in the same Node.js process. Redis required for BullMQ persistence. |
| Extraction item persistence | Database (PostgreSQL) | Bot (Prisma) | Worker calls `createItem()` via Prisma after successful extraction. |
| Due item retrieval | Bot (Prisma query) | — | `getDueItems()` queries ReviewItem directly. No caching tier needed for v1. |
| Review prompt generation | Bot (LLM call) | — | `/review` command generates prompt text via GPT-4o-mini per-card, or uses template-based generation. |
| Card rating | Bot (ts-fsrs in-memory) | — | `rateItem()` calls `scheduler.next()` in-process. Immediate DB update. |
| Review flow state | Bot (in-memory collector) | — | Channel-based MessageComponentCollector tracks which card is being reviewed. No DB cursor needed. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `bullmq` | ^5.80.9 | Background job queue | De facto standard for Node.js Redis job queues (7.3M+ weekly downloads). Required for EXTR-06. Taskforcesh organization, 10+ years of production use. |
| `ioredis` | ^5.11.1 | Redis client | Required by BullMQ (`maxRetriesPerRequest: null` for worker connections). Standard Redis client for Node.js. Already in project stack per AGENTS.md. |
| `openai` (existing) | ^6.x | LLM client SDK | Already in project. Use `client.chat.completions.parse()` with `zodResponseFormat` for structured output. No new LLM SDK needed (D-01). |
| `zod` (existing) | ^4.x (currently 4.4.3) | Runtime validation | Already in project for env config. Define extraction schema with Zod, pass to `zodResponseFormat`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `discord.js` (existing) | ^14.26.x | Button builders + collectors | `/review` command: `ButtonBuilder`, `ActionRowBuilder`, `MessageComponentCollector`, `ButtonStyle` |
| `ts-fsrs` (existing) | ^5.x | SRS math | `createItem()` / `rateItem()` / `getDueItems()` called from extraction worker and review command |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `bullmq` | `p-queue` + PG-based persistence | BullMQ is the right choice for a Redis-backed background pipeline with retries, DLQ, and persistence. `p-queue` would be simpler but lacks persistence across restarts. BullMQ is already in the project stack decision (AGENTS.md). |
| `openai` chat completions with `zodResponseFormat` | Manual JSON parsing + retry | `zodResponseFormat` uses OpenAI's constrained decoding (finite-state machine token masking) to guarantee 100% schema-valid output. Manual parsing has a ~5-15% failure rate requiring retries. Structured outputs is the standard approach in 2026 for production LLM extraction. |
| Worker per-LLM-call (no batching) | Batch pending jobs into one LLM call | Batching would reduce API costs but adds complexity. CONTEXT.md marks this as agent's discretion. Recommendation: start simple with per-job LLM calls (concurrency=1 handles rate limiting naturally). Batch later if API costs become a concern. |

**Installation:**
```bash
npm install bullmq ioredis
```

**Version verification:**
```bash
npm view bullmq version          # → 5.80.9 (published 2026-07-18)
npm view ioredis version          # → 5.11.1 (published 2026-06-04)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `bullmq` | npm | 10+ years (initial publish ~2016) | 7.3M/week | github.com/taskforcesh/bullmq | SUS [WARNING: flagged as "too-new" — latest minor 5.80.9 published 2 days ago, but package is a 10-year-old established project] | Flagged — planner must add `checkpoint:human-verify` |
| `ioredis` | npm | 10+ years | 24M/week | github.com/luin/ioredis | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `bullmq` — the `SUS` verdict is a false positive due to the latest patch release (5.80.9) being 2 days old. The package itself is well-established (7.3M weekly downloads, taskforcesh organization, 10+ years of development). Planner inserts a `checkpoint:human-verify` before `npm install bullmq`.

**Verification details:**
- `bullmq`: Exists on npm, published 2026-07-18, 7,309,281 weekly downloads, GitHub repo at taskforcesh/bullmq, no postinstall script, not deprecated. The `SUS` verdict is from the seam's "too-new" heuristic on the latest patch, not the package itself.
- `ioredis`: Exists on npm, published 2026-06-04, 23,996,654 weekly downloads, GitHub repo at luin/ioredis, no postinstall script, not deprecated. Verdict `OK`.

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              Discord Client                                       │
│  User sends message in thread    User runs /review         User clicks rating     │
└──────────────┬────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐     ┌────────────────────────────────────┐
│  src/events/messageCreate.ts          │     │  src/commands/review.ts            │
│                                      │     │  ┌──────────────────────────────┐  │
│  1. handleConversationMessage(msg)    │     │  │ deferReply()                 │  │
│  2. (after return) enqueue job       │     │  │ getDueItems(userId)          │  │
│     → extractionQueue.add("extract", │     │  │ showNextCard(items, index)   │  │
│         jobPayload, { attempts,      │     │  │  ┌─ embed with prompt       │  │
│           backoff })                 │     │  │  │   and progress            │  │
└──────────────┬───────────────────────┘     │  │  └─ ActionRow with 4 FSRS   │  │
               │                              │  │     rating buttons          │  │
               ▼                              │  │                             │  │
┌──────────────────────────────┐              │  │ awaitMessageComponent()     │  │
│  src/lib/queue.ts             │              │  │   ├─ Again → rateItem(1)   │  │
│  ┌─────────────────────────┐  │              │  │   ├─ Hard  → rateItem(2)   │  │
│  │ extractionQueue: Queue   │  │              │  │   ├─ Good  → rateItem(3)   │  │
│  │ extractionWorker: Worker │──┼── processes  │  │   └─ Easy  → rateItem(4)   │  │
│  │  concurrency: 1          │  │  │  jobs      │  │ showNextCard(nextItem)     │  │
│  │ dlq: Queue (dead-letter) │  │  │           │  │   OR exit embed            │  │
│  └────────────┬─────────────┘  │  │           └──────────────────────────────┘  │
└───────────────┼────────────────┘  │                                              │
                │                   │                                              │
                ▼                   ▼                                              │
┌──────────────────────────────┐  ┌───────────────────────────────────────────┐    │
│  src/services/extraction.ts  │  │  src/services/fsrs.ts (EXISTING)           │    │
│  ┌────────────────────────┐  │  │  ┌─────────────────────────────────────┐  │    │
│  │ Worker processor fn    │  │  │  │ createItem() — called by worker      │  │    │
│  │ 1. Create OpenAI client│  │  │  │   for each detectedItem              │  │    │
│  │ 2. Call parse() with   │  │  │  │ rateItem() — called by review.ts     │  │    │
│  │    zodResponseFormat   │──┼──┼──┤   on each button click               │  │    │
│  │ 3. For each item in    │  │  │  │ getDueItems() — called by review.ts  │  │    │
│  │    detectedItems[]:    │  │  │  └─────────────────────────────────────┘  │    │
│  │    createItem(...)     │  │  │                                            │    │
│  │ 4. Log typosIgnored    │  │  │                                            │    │
│  └────────────────────────┘  │  └───────────────────────────────────────────┘    │
└──────────────────────────────┘                                                   │
                                                                                   │
               ▼                                                                   │
┌──────────────────────────────────────────────────────────────────────────────────┘
│  Redis                               PostgreSQL
│  ┌──────────────┐                    ┌────────────────────┐
│  │ bullmq:       │                    │ ReviewItem         │
│  │ "extraction"  │                    │ id, userId, source │
│  │ "extraction-  │                    │ type, language,    │
│  │  dlq"         │                    │ stability, diff,   │
│  └──────────────┘                    │ state, due, etc.   │
│                                       └────────────────────┘
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Primary flow (extraction):**
1. User sends message in an active session thread
2. `messageCreate.ts` calls `handleConversationMessage()` — completes normally, user sees reply
3. After reply, `messageCreate.ts` enqueues a BullMQ job to `"extraction"` queue with `{ userId, sessionId, messageContent, targetLanguage, nativeLanguage, recentContext }`
4. `extractionWorker` picks up the job (concurrency=1, sequential processing)
5. Worker calls `openai.chat.completions.parse()` with extraction system prompt + `zodResponseFormat`
6. For each item in `parsed.detectedItems[]`, call `fsrsService.createItem({ userId, source, type, language })`
7. Log `parsed.typosIgnored[]` (mechanical typos, ignored)
8. On job failure: retry up to 3 times (1s, 5s, 25s exponential backoff), then move to DLQ

**Primary flow (review):**
1. User runs `/review` → `deferReply()` → `getDueItems(userId)`
2. If items found: show first card embed + 4 FSRS rating buttons (Again/Hard/Good/Easy)
3. Use `interaction.channel.awaitMessageComponent()` with filter for user + button customIds
4. On button click: `deferUpdate()` → `rateItem(itemId, rating)` → if more items, show next card
5. If `"exit"` button clicked or no more items: show completion embed, terminate collector
6. On timeout (2 min inactivity): edit reply to show "Review session expired" with disabled buttons

### Recommended Project Structure
```
src/
├── lib/
│   └── queue.ts              # (NEW) BullMQ connection, Queue singleton, Worker, DLQ
├── services/
│   └── extraction.ts          # (NEW) Extraction worker processor: prompt + LLM call + persistence
├── commands/
│   ├── review.ts              # (NEW) /review slash command with rating buttons
│   └── index.ts              # (MODIFY) register review command
├── types/
│   ├── session.ts            # (EXISTING)
│   └── extraction.ts         # (NEW) Extraction job payload types, Zod schemas
├── events/
│   └── messageCreate.ts      # (MODIFY) add extraction enqueue after conversation response
├── prompts/
│   └── extraction/
│       └── system.md         # (NEW) Extraction system prompt
├── index.ts                  # (MODIFY) initialize worker + graceful shutdown
└── lib/
    └── config.ts             # (EXISTING) EXTRACTION_MODEL, REDIS_URL already defined
```

### Pattern 1: BullMQ Connection + Queue Singleton

**What:** A shared Redis connection for BullMQ Queue + Worker instances. The Queue and Worker share an ioredis connection (Worker internally duplicates for blocking commands). This establishes a single source of truth for Redis connectivity.

**When to use:** Every BullMQ component — extraction queue, extraction worker, and dead-letter queue.

```typescript
// Source: BullMQ 5.x official docs — connections guide
// [CITED: docs.bullmq.io/guide/connections]
// [VERIFIED: npm registry — bullmq@5.80.9, ioredis@5.11.1]

import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { env } from "../lib/config.js";
import { processExtractionJob } from "../services/extraction.js";

// ioredis connection shared by Queue and Worker
// Worker needs maxRetriesPerRequest: null for blocking connection
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const extractionQueue = new Queue("extraction", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s, then 2s, then 4s — matches CONTEXT.md's 1s/5s/25s approx.
    },
    removeOnComplete: { age: 3600 * 24 },   // keep completed jobs 24h
    removeOnFail: { age: 3600 * 24 * 7 },    // keep failed jobs 7d
  },
});

// Dead-letter queue for inspection after all retries exhausted
export const extractionDlq = new Queue("extraction-dlq", { connection });

export const extractionWorker = new Worker(
  "extraction",
  async (job: Job) => {
    await processExtractionJob(job.data);
  },
  {
    connection,
    concurrency: 1, // D-03: single concurrent extraction
  },
);

// Move to DLQ when all retries exhausted
extractionWorker.on("failed", async (job, error) => {
  if (!job) return;
  const maxAttempts = job.opts.attempts || 1;
  if (job.attemptsMade >= maxAttempts) {
    await extractionDlq.add("failed-extraction", {
      originalJobId: job.id,
      data: job.data,
      error: { message: error.message, stacktrace: job.stacktrace },
    });
  }
});

extractionWorker.on("error", (err) => {
  console.error("Extraction worker error:", err);
});
```

**Important notes:**
- **Do NOT pass `maxRetriesPerRequest: null` to the Queue connection** — only the Worker needs it. For simplicity in v1, using the same connection for both is acceptable since the Worker's `duplicate()` call handles blocking internally.
- **The `backoff.delay` is a seed value**, not literal. Exponential: attempt 2 = 1s, attempt 3 = 2s, attempt 4 = 4s. To get exact 1s/5s/25s, use a custom backoff strategy in the Worker settings or use `fixed` with different delays per attempt via `backoffStrategy`.

### Pattern 2: Extraction Worker with OpenAI Structured Output

**What:** The worker processor function that calls GPT-4o-mini with a system prompt and user message, getting back typed structured output via `zodResponseFormat`.

**When to use:** Every BullMQ extraction job.

```typescript
// Source: OpenAI SDK v6 helpers for Zod — openai-node/helpers.md
// [CITED: github.com/openai/openai-node/blob/main/helpers.md]
// [VERIFIED: npm registry — openai@6.48.0]

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../lib/config.js";
import { createItem } from "./fsrs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI();

const EXTRACTION_SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "extraction", "system.md"),
  "utf-8",
);

// ─── Zod Schema (D-06, D-07) ────────────────────────────────────────────

const ExtractionSchema = z.object({
  detectedItems: z.array(
    z.object({
      source: z.string(),
      type: z.enum(["vocabulary", "grammar"]),
    }),
  ),
  typosIgnored: z.array(z.string()),
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

// ─── Job Payload Type (D-04) ─────────────────────────────────────────────

export interface ExtractionJobPayload {
  userId: string;
  sessionId: string;
  messageContent: string;
  targetLanguage: string;
  nativeLanguage: string;
  recentContext: string; // last 2-3 messages joined as text
}

// ─── Worker Processor ─────────────────────────────────────────────────────

export async function processExtractionJob(
  data: ExtractionJobPayload,
): Promise<void> {
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT
    .replace("{{targetLanguage}}", data.targetLanguage)
    .replace("{{nativeLanguage}}", data.nativeLanguage);

  const userContext = data.recentContext
    ? `Recent conversation context:\n${data.recentContext}\n\n`
    : "";

  const completion = await openai.chat.completions.parse({
    model: env.EXTRACTION_MODEL, // "gpt-4o-mini"
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `${userContext}Analyze this message from the language learner:\n\n${data.messageContent}`,
      },
    ],
    response_format: zodResponseFormat(ExtractionSchema, "extraction"),
    temperature: 0.1, // Low temperature for deterministic extraction
  });

  const parsed: ExtractionResult | null =
    completion.choices[0]?.message?.parsed;

  if (!parsed) {
    // Refusal or parsing failure — log and skip
    console.warn(
      "Extraction returned null for job:",
      data.sessionId,
      "refusal:",
      completion.choices[0]?.message?.refusal,
    );
    return;
  }

  // Persist each detected item via existing FSRS service
  for (const item of parsed.detectedItems) {
    try {
      await createItem({
        userId: data.userId,
        source: item.source,
        type: item.type,
        language: data.targetLanguage,
      });
    } catch (err) {
      console.error("Failed to persist extracted item:", item, err);
      // Continue to next item — partial success is acceptable
    }
  }

  // Log ignored typos (observability, not persisted)
  if (parsed.typosIgnored.length > 0) {
    console.log(
      `Extraction ignored typos for user ${data.userId}:`,
      parsed.typosIgnored,
    );
  }
}
```

**Key design decisions:**
- **`temperature: 0.1`** — extraction should be deterministic, not creative. Low temperature reduces hallucinated extractions.
- **`zodResponseFormat`** — uses OpenAI's constrained decoding (FSM-based token masking) to guarantee 100% schema-valid output. No manual JSON.parse or retry-on-malformed needed.
- **The `parse()` method** returns `completion.choices[0]?.message?.parsed` — typed as `ExtractionResult | null`. If the model refuses (safety filter), `parsed` is null and `refusal` contains the explanation.
- **Partial persistence** — if one `createItem()` fails, continue with remaining items. The job itself does not fail on individual item creation errors; only LLM call failures trigger retries.

### Pattern 3: Enqueue Extraction After Conversation Response

**What:** The hook point in `messageCreate.ts` — after `handleConversationMessage` completes, enqueue the user's message to BullMQ for background extraction.

**When to use:** Every user message in an active session.

```typescript
// Source: CONTEXT.md D-02 — post-response enqueue, concurrency=1
// [ASSUMED — integration pattern derived from existing code]

import type { Client, Message } from "discord.js";
import { activeSessions, handleConversationMessage } from "../services/conversation.js";
import { extractionQueue } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";

export function registerMessageCreateHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const channel = message.channel;
    if (!channel.isThread()) return;

    const session = activeSessions.get(channel.id);
    if (!session) return;
    if (message.author.id !== session.userId) return;

    try {
      // 1. Handle conversation (existing logic — unchanged)
      await handleConversationMessage(channel, message.author.id, message.content);

      // 2. Enqueue extraction job (NEW — after conversation response completes)
      await enqueueExtraction(session, message.content);
    } catch (error) {
      console.error("Error handling conversation message:", error);
    }
  });
}

async function enqueueExtraction(
  session: NonNullable<ReturnType<typeof activeSessions.get>>,
  messageContent: string,
): Promise<void> {
  // Fetch user profile for languages
  const user = await prisma.user.findUnique({
    where: { discordId: session.userId },
  });
  if (!user) return;

  // Fetch last 2-3 messages for context (D-04: recentContext)
  const recentMessages = await prisma.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { role: true, content: true },
  });

  const recentContext = recentMessages
    .reverse()
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  await extractionQueue.add(
    "extract",
    {
      userId: user.id,
      sessionId: session.id,
      messageContent,
      targetLanguage: user.targetLanguage,
      nativeLanguage: user.nativeLanguage,
      recentContext,
    },
    {
      // Job-specific overrides for defaultJobOptions
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
}
```

### Pattern 4: Review Command with FSRS Rating Buttons

**What:** `/review` slash command that fetches due items, presents them one-by-one with three prompt types and FSRS rating buttons, using a channel-based MessageComponentCollector for the interactive flow.

**When to use:** The review command handler.

```typescript
// Source: discord.js v14 Guide — Buttons + Collectors
// [CITED: discordjs.guide/interactive-components/buttons]
// [VERIFIED: npm registry — discord.js@14.26.x]

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
import { getDueItems, rateItem, getItem, type RatingValue } from "../services/fsrs.js";
import type { Command } from "../types/discord.js";

// Embed color for review cards
const REVIEW_COLOR = 0x9b59b6;

// Prompt types to cycle through (REVW-02)
const PROMPT_TYPES = ["use-in-sentence", "fill-in-blank", "native-translation"] as const;
type PromptType = (typeof PROMPT_TYPES)[number];

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Review due vocabulary and grammar items with spaced repetition"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await prisma.user.findUnique({
      where: { discordId: interaction.user.id },
    });
    if (!user?.configured) {
      await interaction.editReply("⚠️ Please run `/setup` first.");
      return;
    }

    const items = await getDueItems(user.id);
    if (items.length === 0) {
      await interaction.editReply("🎉 No items due for review! You're all caught up.");
      return;
    }

    // Start the review flow with the first item
    await showReviewCard(interaction, items, 0, user.targetLanguage);
  },
};

async function showReviewCard(
  interaction: Parameters<Command["execute"]>[0],
  items: Awaited<ReturnType<typeof getDueItems>>,
  index: number,
  targetLanguage: string,
): Promise<void> {
  if (index >= items.length) {
    // All cards reviewed
    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🎉 Review Complete!")
      .setDescription(`You reviewed all ${items.length} due items. Great job!`)
      .setTimestamp();
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  const item = items[index];
  const promptType = PROMPT_TYPES[index % PROMPT_TYPES.length];

  // Build the review embed
  const embed = new EmbedBuilder()
    .setColor(REVIEW_COLOR)
    .setTitle(`Review ${index + 1} of ${items.length}`)
    .addFields(
      { name: "Item", value: `\`${item.source}\` (${item.type})`, inline: true },
      { name: "Prompt Type", value: promptType.replace(/-/g, " "), inline: true },
    )
    .setFooter({ text: "Rate how well you remembered this item" })
    .setTimestamp();

  // FSRS rating buttons (REVW-03)
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

  const ratingRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    againBtn, hardBtn, goodBtn, easyBtn,
  );
  const exitRow = new ActionRowBuilder<ButtonBuilder>().addComponents(exitBtn);

  await interaction.editReply({
    embeds: [embed],
    components: [ratingRow, exitRow],
  });

  // Wait for button click (2 min timeout)
  try {
    const buttonInteraction = await interaction.channel!.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        (i.customId.startsWith("review_") && i.customId.endsWith(item.id) ||
         i.customId === "review_exit"),
      time: 120_000,
    });

    await buttonInteraction.deferUpdate();

    if (buttonInteraction.customId === "review_exit") {
      const exitEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle("📚 Review Session Ended")
        .setDescription(`You reviewed ${index} of ${items.length} items.`)
        .setTimestamp();
      await interaction.editReply({ embeds: [exitEmbed], components: [] });
      return;
    }

    // Map button to FSRS rating (REVW-03)
    const ratingMap: Record<string, RatingValue> = {
      review_again: 1, // Again
      review_hard: 2,  // Hard
      review_good: 3,  // Good
      review_easy: 4,  // Easy
    };
    const prefix = buttonInteraction.customId.replace(`_${item.id}`, "");
    const rating = ratingMap[prefix];
    if (!rating) throw new Error(`Unknown rating prefix: ${prefix}`);

    // Apply rating (REVW-04)
    await rateItem({ itemId: item.id, rating });

    // Show next card
    await showReviewCard(interaction, items, index + 1, targetLanguage);
  } catch (error) {
    // Timeout or other error — disable buttons
    if (error instanceof Error && error.message.includes("time")) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("⏰ Review Session Expired")
        .setDescription("The review timed out. Run `/review` again to continue.")
        .setTimestamp();
      await interaction.editReply({ embeds: [timeoutEmbed], components: [] });
      return;
    }
    throw error;
  }
}
```

**Key design decisions:**
- **Custom ID format:** `review_{rating}_{itemId}` — encodes the rating action and item ID for unique identification. The filter checks `startsWith("review_")` and `endsWith(itemId)` to ensure per-item button matching.
- **Recursive `showReviewCard`** — each card calls itself with `index + 1` after the user rates. No external state tracking needed. Collector timeout (2 min) automatically ends stale sessions.
- **Exit button** — allows user to stop early. Shows progress: "You reviewed X of Y items."
- **Prompt type rotation** — cycles through `use-in-sentence`, `fill-in-blank`, `native-translation` based on `index % 3`. The actual prompt text generation (calling LLM to generate a prompt fitting the item) is left to the planner's discretion in implementation.

### Pattern 5: Graceful Shutdown for BullMQ

**What:** Extend `src/index.ts` shutdown handler to close BullMQ queue, worker, and Redis connections.

**When to use:** During `SIGTERM`/`SIGINT` handling.

```typescript
// Source: BullMQ 5.x guide — graceful shutdown
// [CITED: docs.bullmq.io/guide/workers]
// Block: Modify src/index.ts

import { extractionQueue, extractionWorker, extractionDlq } from "./lib/queue.js";

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${signal}] Graceful shutdown started`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timeout — force exiting");
    process.exit(1);
  }, 10_000);

  try {
    // 1. Close BullMQ worker (stops accepting new jobs)
    console.log("Closing extraction worker...");
    await extractionWorker.close();
    console.log("Extraction worker closed");

    // 2. Optionally drain the queue (wait for in-progress jobs)
    console.log("Draining extraction queue...");
    await extractionQueue.drain();
    console.log("Extraction queue drained");

    // Save active sessions (existing)
    console.log(`Saving ${activeSessions.size} active sessions...`);
    for (const [_threadId, session] of activeSessions) {
      await prisma.session.update({
        where: { id: session.id },
        data: {
          summary: session.summary,
          messageCount: session.messageCount,
          correctionCount: session.correctionCount,
        },
      });
    }
    console.log("Active sessions saved");

    await client.destroy();
    console.log("Discord client destroyed");

    await prisma.$disconnect();
    console.log("Prisma disconnected");

    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}
```

**Shutdown sequence rationale:**
1. Close Worker first — stops accepting new jobs; allows in-flight job to complete
2. Drain Queue — removes pending items from Redis (jobs survive restart via Redis persistence, but draining is clean)
3. Save sessions — same order as before
4. Destroy Discord client — same as before
5. Disconnect Prisma — same as before

### Anti-Patterns to Avoid

- **Blocking the conversation response:** Don't `await` the extraction job inside `handleConversationMessage`. The extraction is fire-and-forget from the message handler. If BullMQ enqueue fails (Redis down), catch the error and log it — do not fail the user's reply.

- **Re-instantiating OpenAI client per job:** Create the OpenAI client once at module level in `extraction.ts` and reuse it. Re-creating it per job adds unnecessary TLS handshake overhead.

- **Direct Redis manipulation:** Don't touch BullMQ's Redis keys directly. Always use the Queue/Worker API. BullMQ uses complex Lua scripts and Redis Streams internally.

- **Using `scheduler.repeat()` for single rating:** In the review flow, you know the exact rating from the button click. Use `scheduler.next()` (which `rateItem()` already does internally), not `scheduler.repeat()`.

- **Passing `maxRetriesPerRequest` to Queue connection:** This is only needed for Worker connections (blocking commands). The Queue (adding jobs) can use ioredis defaults. Using the same connection for both is fine; Worker's `duplicate()` handles it.

- **Storing review flow state in DB:** Don't create a database cursor or session for the review flow. Use the in-memory `MessageComponentCollector` — it's simpler, survives the duration of the interaction, and auto-expires on timeout.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Background job queue with retry | Custom Redis-based queue with polling | BullMQ 5.x | BullMQ handles atomic job scheduling, retries with backoff, dead-letter queues, stalled job detection, Redis Streams exactly-once semantics. A hand-rolled solution would need to reimplement all of this. |
| LLM response parsing | JSON.parse + regex fallback + retry loops | OpenAI `parse()` + `zodResponseFormat` | OpenAI's structured outputs use constrained decoding (FSM token masking) for 100% schema guarantee. Manual parsing has ~5-15% failure rates even with strict prompts. |
| Button interaction state | Global Map + interaction IDs | discord.js MessageComponentCollector | Channel-based collector auto-handles timeouts, filters, and per-user scoping. A global state Map would need manual cleanup, garbage collection, and stale session detection. |
| FSRS card creation from extracted items | Custom item creation logic | Existing `createItem()` from `src/services/fsrs.ts` | Already implemented and tested in Phase 3. Takes `{ userId, source, type, language }` — exactly what extraction produces. |

**Key insight:** This phase connects existing building blocks (FSRS service, OpenAI client, discord.js interactions) with two new infrastructure components (BullMQ queue, structured output extraction). The code is predominantly wiring — `messageCreate.ts` → BullMQ → `extraction.ts` → `fsrs.ts`, and `/review` → `getDueItems()` → buttons → `rateItem()`. Do not add unnecessary abstraction layers between these well-defined boundaries.

## Common Pitfalls

### Pitfall 1: Job Payload Too Large

**What goes wrong:** The extraction job payload includes `recentContext` (last 3 messages), which can be several kilobytes. Large job payloads increase Redis memory usage and serialization overhead.

**Why it happens:** `recentContext` is built from the user's own messages, which can be long.

**How to avoid:** Keep `recentContext` to the last 2-3 messages (D-04 limit). Truncate individual messages to 2000 characters if needed. The extraction LLM only needs context, not complete transcripts.

**Warning signs:** Redis memory growth, slow job serialization.

### Pitfall 2: Worker Blocking on LLM Timeout

**What goes wrong:** If the OpenAI API is slow or unresponsive, the extraction worker (concurrency=1) blocks waiting for the response. All subsequent extraction jobs queue up behind the stalled one.

**Why it happens:** concurrency=1 means only one extraction runs at a time. An LLM call that takes 30 seconds blocks the queue.

**How to avoid:** Set a reasonable `max_tokens` limit on extraction calls (recommended: 300 tokens — extraction output is small). Use OpenAI's client timeout option. BullMQ's job timeout (`opts.timeout`) can also kill stalled jobs.

```typescript
const completion = await openai.chat.completions.parse({
  model: env.EXTRACTION_MODEL,
  messages: [...],
  response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  max_tokens: 300,     // Keep extraction responses small
  temperature: 0.1,
}, {
  timeout: 15_000,     // 15s timeout on the HTTP request
});
```

### Pitfall 3: Duplicate Item Creation

**What goes wrong:** If the same vocabulary word appears in multiple messages, the extraction pipeline creates duplicate ReviewItem entries. Over time, the user accumulates many identical items with different FSRS states.

**Why it happens:** The extraction worker has no deduplication logic — it creates a new item for each `detectedItem` in each message.

**How to avoid:** Add a deduplication check in the worker before calling `createItem()`: check if an item with the same `userId` + `source` + `type` already exists. For v1, this can be simple (check existence), but note that users may want multiple items for the same word (e.g., seeing vocabulary in different contexts). CONTEXT.md leaves this at agent's discretion — planners should decide on dedup strategy.

**Warning signs:** User's review queue grows rapidly with many similar items.

### Pitfall 4: Missing Error Listener on Worker

**What goes wrong:** BullMQ Worker emits an `error` event when the Redis connection fails. If no error listener is attached, Node.js throws an unhandled error and the worker stops processing jobs.

**Why it happens:** The `Worker` class inherits from EventEmitter. Per Node.js conventions, `error` events with no listener throw.

**How to avoid:** Always attach an `error` handler:

```typescript
extractionWorker.on("error", (err) => {
  console.error("Extraction worker error:", err);
});
```

### Pitfall 5: Button Interaction Stale After 15 Minutes

**What goes wrong:** Discord messages with buttons expire after 15 minutes. If the review session starts but the user takes longer than 15 minutes between ratings, the `editReply()` call fails because the original interaction is stale.

**Why it happens:** Discord enforces a 15-minute window for deferred interaction edits.

**How to avoid:** The 2-minute collector timeout (in Pattern 4) prevents this in practice. If the review needs longer per card, use `interaction.followUp()` for subsequent cards instead of `interaction.editReply()`. For v1, the 2-min timeout is sufficient.

## Code Examples

### Extraction System Prompt (Recommended Template)

```markdown
You are an extraction assistant for a language learning app. Your job is to analyze a
language learner's message in {{targetLanguage}} (their target language) and extract
vocabulary and grammar items for spaced repetition practice.

The user's native language is {{nativeLanguage}}.

RULES:
1. Extract vocabulary items for words that seem new or unfamiliar for the user's level.
2. Extract grammar items for structural errors or patterns worth practicing.
3. MECHANICAL TYPOS: If the user clearly knows the word but mistyped it (e.g., "teh" → "the",
   "recieve" → "receive"), add the mistyped word to "typosIgnored" — do NOT create an item for it.
4. COGNITIVE MISTAKES: If the user used the wrong word, wrong tense, or incorrect grammar
   (showing they don't know the correct form), add the correct target-language term or pattern
   to "detectedItems".
5. CODE-SWITCHING: If the user inserted a word or phrase from {{nativeLanguage}} instead of
   {{targetLanguage}}, infer the intended {{targetLanguage}} equivalent and create an item with
   that equivalent as the "source". For example, if target=Spanish and user writes "I love sci-fi",
   infer "ciencia ficción" as the source.
6. For grammar items, the "source" should be a short description of the pattern (e.g.,
   "preterite vs imperfect distinction", "adjective agreement with gender").
7. Do NOT create items for words the user used correctly in context.
8. If nothing worth extracting, return empty detectedItems array.
```

### BullMQ Job Type

```typescript
// src/types/extraction.ts — Zod schema for job payload validation
// [ASSUMED — type design derived from D-04 job payload spec]

import { z } from "zod";

export const ExtractionJobPayloadSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  messageContent: z.string().min(1).max(2000),
  targetLanguage: z.string().min(1),
  nativeLanguage: z.string().min(1),
  recentContext: z.string().max(5000),
});

export type ExtractionJobPayload = z.infer<typeof ExtractionJobPayloadSchema>;

// Zod schema for OpenAI structured output (D-06, D-07)
export const ExtractionResultSchema = z.object({
  detectedItems: z.array(
    z.object({
      source: z.string().min(1),
      type: z.enum(["vocabulary", "grammar"]),
    }),
  ),
  typosIgnored: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
```

### Worker Initialization in index.ts (startup section)

```typescript
// Add to src/index.ts main() function, after rehydrateSessions()

import { extractionWorker } from "./lib/queue.js";

async function main() {
  await deployCommands();
  await client.login(env.DISCORD_TOKEN);
  console.log("Bot logged in successfully");

  await rehydrateSessions(client);

  // Start the extraction worker (NEW)
  // Worker is already instantiated — just ensure it's running
  console.log("Extraction worker initialized (concurrency=1)");
}
```

The Worker is already running when instantiated (`autorun: true` by default in BullMQ 5.x). No explicit `.run()` call needed.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON Mode (OpenAI) — valid JSON but not schema-compliant | Structured Outputs with `response_format: json_schema` | August 2024 | 100% schema guarantee via constrained decoding. No more retry-on-malformed. |
| Bull v3 (original Bull, unmaintained) | BullMQ 5.x (Redis Streams-based) | 2020–2024 | BullMQ added TypeScript support, Redis Streams for exactly-once processing, FlowProducer DAGs, improved stalled job detection. Bull original is deprecated since 2020. |
| Manual extraction via `/add-item` | Automatic background extraction via BullMQ + LLM | Phase 4 | Items are created without user effort during conversation. The `/add-item` command remains available for manual additions. |

**Deprecated/outdated:**
- **OpenAI JSON Mode** (`response_format: { type: "json_object" }`) — Use `json_schema` with `strict: true` instead. JSON Mode only guarantees valid JSON, not schema compliance.
- **Bull (original)** — Deprecated since 2020. Use BullMQ 5.x.
- **discord.js Message Components v1** (MessageActionRow, MessageButton) — These were deprecated in discord.js v14. Use `ActionRowBuilder` and `ButtonBuilder`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The OpenAI SDK `client.chat.completions.parse()` with `zodResponseFormat` works with GPT-4o-mini | Extraction Architecture | If not supported, fall back to manual JSON mode + Zod validation with retry. The `response_format: json_schema` is supported on GPT-4o-mini per OpenAI docs. |
| A2 | BullMQ `Worker` constructor with `concurrency: 1` serializes job processing as expected | BullMQ Setup | Concurrency=1 guarantees in-order processing per queue. This is well-documented behavior — LOW risk. |
| A3 | The `duplicate()` call inside BullMQ Worker creates a separate ioredis connection for blocking commands | BullMQ Connection | If ioredis `duplicate()` fails (deprecated API changes), worker may not connect. ioredis v5.11 supports `duplicate()`. LOW risk. |
| A4 | `messageCreate.ts` runs after `handleConversationMessage` completes (same async function) | Integration Points | The try/catch block ensures sequential execution. This is standard async/await behavior. LOW risk. |

## Open Questions (RESOLVED)

1. **Batching strategy — should the worker batch pending jobs into one LLM call?**
   - What we know: CONTEXT.md marks this as agent's discretion. With concurrency=1 and ~1-3 messages per second, the queue processes sequentially already.
   - What's unclear: Whether multiple pending jobs accumulate fast enough to benefit from batching.
   - → RESOLVED: Start with one LLM call per job (simplest). Add batching later if API cost monitoring shows it's needed. GPT-4o-mini is cheap ($0.15/1M input tokens) — batching may not save enough to justify complexity.

2. **Review prompt generation — LLM-generated or template-based?**
   - What we know: REVW-02 requires three prompt types (use-in-sentence, fill-in-blank, native-translation). CONTEXT.md leaves this to agent's discretion.
   - What's unclear: Whether to generate prompts per-card via a lightweight LLM call (GPT-4o-mini, ~50 tokens each) or use template-based prompts (e.g., "Use '{{source}}' in a {{targetLanguage}} sentence").
   - → RESOLVED: Template-based prompts for v1 (no extra LLM cost, instant). LLM-generated prompts add polish but can be deferred to v2.

3. **Deduplication strategy — should extraction skip existing items?**
   - What we know: Multiple messages can contain the same vocabulary word. Without dedup, many duplicate items accumulate.
   - What's unclear: Whether users benefit from repeated exposure to the same word via different items, or whether dedup is expected.
   - → RESOLVED: Simple dedup in the worker: check `prisma.reviewItem.findFirst({ where: { userId, source, type }})` before creating. If item exists, skip. This prevents runaway queue growth.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22+ | BullMQ 5.x, ioredis 5.x | ✓ | 22.23.1 LTS | — |
| npm | Installing packages | ✓ | (project default) | — |
| PostgreSQL | Prisma (existing) | ✓ | 17 (project config) | — |
| Redis | BullMQ queue storage | ✓ | 7 (project config) | — |
| OpenAI API key | Extraction LLM call | ✓ | (project env) | — |
| ioredis | BullMQ connection | ✓ (will install) | 5.11.1 | `node-redis` adapter via `createNodeRedisClient` |
| bullmq | Queue + Worker | ✓ (will install) | 5.80.9 | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXTR-02 | Extraction Zod schema validates output correctly | unit | `npx vitest run src/__tests__/extraction.test.ts -t "schema"` | ❌ Wave 0 |
| EXTR-03 | Semantic filtering: cognitive mistakes extracted, typos ignored | unit | (mock LLM, test schema parsing) | ❌ Wave 0 |
| EXTR-04 | Code-switching items have target-language source | unit | (mock LLM, test schema parsing) | ❌ Wave 0 |
| EXTR-05 | Worker calls createItem() for each detected item | unit | `npx vitest run src/__tests__/extraction.test.ts -t "worker"` | ❌ Wave 0 |
| EXTR-06 | BullMQ job enqueues with correct payload | unit | (mock queue, test messageCreate.ts integration) | ❌ Wave 0 |
| REVW-01 | getDueItems returns due items for user | unit | (existing fsrs test file) | ✅ (Phase 3) |
| REVW-03 | Rating buttons call rateItem with correct values | unit | `npx vitest run src/__tests__/review.test.ts` | ❌ Wave 0 |
| REVW-04 | rateItem updates FSRS scheduling | unit | (existing fsrs test file) | ✅ (Phase 3) |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/extraction.test.ts` — Extraction service unit tests (schema validation, worker logic with mocked OpenAI + Prisma)
- [ ] `src/__tests__/review.test.ts` — Review command unit tests (button flow with mocked Prisma)
- [ ] Update `src/__tests__/setup.ts` — add `queue` mocks to mockPrisma if needed, or mock `src/lib/queue.ts`

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord OAuth2 is the sole identity provider |
| V3 Session Management | no | No sessions — BullMQ jobs carry userId from the authenticated Discord interaction |
| V4 Access Control | yes | All ReviewItem queries (getDueItems, rateItem) filter by userId derived from Discord auth |
| V5 Input Validation | yes | Extraction job payload validated with Zod before processing; Zod schema for LLM output enforces type/structure |
| V6 Cryptography | no | No secrets stored or transmitted beyond existing Redis URL + OpenAI key |

### Known Threat Patterns for Node.js + BullMQ
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Job injection via message content | Tampering | Extraction job payload is constructed server-side from authenticated session data. `messageContent` is user-provided but processed through a Prisma `create()` with parameterised queries, not executed as code. |
| Redis connection hijacking | Information Disclosure | REDIS_URL is stored in the .env file (not git) and passed via environment variable. Docker Compose exposes Redis on the internal network only. |
| LLM prompt injection via crafted messages | Spoofing | Extraction prompt treats message content as data to analyze, not instructions. The system prompt is static (file on disk); user content is injected at a specific location. OpenAI's structured output mode reduces injection surface by constraining the output format. |
| Job replay / duplicate processing | Tampering | BullMQ's at-least-once delivery means a job may process twice on worker crash. Creating a duplicate ReviewItem is low-risk (another FSRS card for the same content). For stricter idempotency, add a processed-job hash table checked before `createItem()`. |

## Sources

### Primary (HIGH confidence)
- **BullMQ 5.x docs** (docs.bullmq.io) — Queue, Worker, connections, retry strategies, dead-letter patterns, graceful shutdown
- **OpenAI SDK — helpers.md** (github.com/openai/openai-node/blob/main/helpers.md) — `zodResponseFormat`, `client.chat.completions.parse()` API, Zod schema rules for structured output
- **discord.js v14 Guide — Buttons** (discordjs.guide/interactive-components/buttons) — `ButtonBuilder`, `ActionRowBuilder`, `ButtonStyle`, `MessageComponentCollector`
- **npm registry** — bullmq@5.80.9, ioredis@5.11.1, openai@6.48.0, zod@4.4.3, discord.js@14.26.x
- **Existing codebase** — `src/services/fsrs.ts`, `src/events/messageCreate.ts`, `src/index.ts`, `src/commands/`, `src/lib/config.ts`, `prisma/schema.prisma`

### Secondary (MEDIUM confidence)
- **Software Herald BullMQ 5 Guide (2026-07)** — Production patterns for connections, retries, DLQ, observability
- **OneUptime DLQ Guide (2026-01)** — Dead-letter queue implementation patterns for BullMQ

### Tertiary (LOW confidence)
- **WebSearch results** — Various blog posts confirming established patterns (no contradictions with primary sources)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — bullmq@5.80.9 and ioredis@5.11.1 verified on npm registry; all existing deps (openai, zod, discord.js) already in project
- Architecture: HIGH — Patterns derived from official docs (BullMQ, OpenAI SDK, discord.js guide) and existing codebase conventions
- Pitfalls: MEDIUM — LLM timeout and deduplication are phase-specific concerns; observed in similar extraction pipeline projects
- Integration points: HIGH — messageCreate.ts/ index.ts hooks are straightforward; patterns proven in prior phases

**Research date:** 2026-07-20
**Valid until:** 2026-08-19 (30-day window — BullMQ 5.x is stable, patch releases only)
