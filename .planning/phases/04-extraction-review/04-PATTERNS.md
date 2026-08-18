# Phase 4: Extraction & Review — Pattern Map

**Mapped:** 2026-07-20
**Files analyzed:** 8 (5 new, 3 modify)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/queue.ts` (NEW) | utility | event-driven | `src/lib/prisma.ts` | role-match |
| `src/services/extraction.ts` (NEW) | service | event-driven | `src/services/conversation.ts` | role-match |
| `src/commands/review.ts` (NEW) | command | request-response (interactive) | `src/commands/setup.ts` | exact |
| `src/types/extraction.ts` (NEW) | types | N/A | `src/types/session.ts` | exact |
| `src/prompts/extraction/system.md` (NEW) | prompt | N/A | `src/prompts/conversation/system.md` | exact |
| `src/events/messageCreate.ts` (MODIFY) | event handler | request-response → event-driven | itself | exact |
| `src/index.ts` (MODIFY) | entry point | N/A | itself | exact |
| `src/commands/index.ts` (MODIFY) | config | N/A | itself | exact |

## Pattern Assignments

### `src/lib/queue.ts` (NEW) — utility, event-driven

**Analog:** `src/lib/prisma.ts` (singleton connection pattern)

**Imports pattern** (from `src/lib/prisma.ts` lines 1-2):
```typescript
import { PrismaClient } from "@prisma/client";
```

For queue.ts, use BullMQ + ioredis imports instead:
```typescript
import IORedis from "ioredis";
import { Queue, Worker } from "bullmq";
import { env } from "../lib/config.js";
import { processExtractionJob } from "../services/extraction.js";
```

**Singleton connection pattern** (from `src/lib/prisma.ts` lines 3-12):
```typescript
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });
```

For queue.ts, the ioredis connection is created at module level (no globalThis needed since BullMQ handles its own lifecycle):
```typescript
const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
```

**Env config reference** (from `src/lib/config.ts` lines 7, 14):
```typescript
REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
EXTRACTION_MODEL: z.string().default("gpt-4o-mini"),
```

---

### `src/services/extraction.ts` (NEW) — service, event-driven

**Analog:** `src/services/conversation.ts` (OpenAI client + prompt loading + service pattern)

**Imports pattern** (from `src/services/conversation.ts` lines 1-19):
```typescript
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
```

**OpenAI client singleton** (from `src/services/conversation.ts` line 23):
```typescript
const openai = new OpenAI();
```

**Prompt loading pattern** (from `src/services/conversation.ts` lines 21, 24-27):
```typescript
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "system.md"),
  "utf-8",
);
```

**OpenAI call pattern** (from `src/services/conversation.ts` lines 239-244):
```typescript
const completion = await openai.chat.completions.create({
  model: env.CONVERSATION_MODEL,
  messages: contextMessages,
  temperature: 0.7,
  max_tokens: 1024,
});
```

For extraction.ts, use `parse()` with `zodResponseFormat` instead of `create()`:
```typescript
import { zodResponseFormat } from "openai/helpers/zod";

const completion = await openai.chat.completions.parse({
  model: env.EXTRACTION_MODEL,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
  response_format: zodResponseFormat(ExtractionSchema, "extraction"),
  temperature: 0.1,
  max_tokens: 300,
}, { timeout: 15_000 });
```

**FSRS service call pattern** (from `src/commands/add-item.ts` lines 59-64):
```typescript
const item = await createItem({
  userId: user.id,
  source,
  type,
  language,
});
```

---

### `src/commands/review.ts` (NEW) — command, request-response (interactive)

**Analog:** `src/commands/setup.ts` (interactive command with MessageComponentCollector)

**Imports pattern** (from `src/commands/setup.ts` lines 1-11):
```typescript
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
```

For review.ts, use ButtonBuilder instead of StringSelectMenuBuilder:
```typescript
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
import { getDueItems, rateItem, getItem } from "../services/fsrs.js";
import type { Command } from "../types/discord.js";
```

**Command export pattern** (from `src/commands/setup.ts` lines 13-14):
```typescript
export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure your native and target languages"),
```

**Defer reply pattern** (from `src/commands/setup.ts` line 19):
```typescript
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
```

**MessageComponentCollector pattern** (from `src/commands/setup.ts` lines 44-49):
```typescript
const nativeResponse = await interaction.channel!.awaitMessageComponent({
  componentType: ComponentType.StringSelect,
  filter: (i) =>
    i.customId === "native_lang" && i.user.id === interaction.user.id,
  time: 60_000,
});
```

For review.ts, use `ComponentType.Button` instead of `ComponentType.StringSelect`:
```typescript
const buttonInteraction = await interaction.channel!.awaitMessageComponent({
  componentType: ComponentType.Button,
  filter: (i) =>
    i.user.id === interaction.user.id &&
    (i.customId.startsWith("review_") || i.customId === "review_exit"),
  time: 120_000,
});
```

**Error handling with timeout** (from `src/commands/setup.ts` lines 110-121):
```typescript
} catch (error) {
  if (error instanceof Error && error.message.includes("timeout")) {
    await interaction.editReply({
      content: "⏰ Setup timed out. Please run `/setup` again when you're ready.",
      components: [],
    });
    return;
  }
  throw error;
}
```

**User lookup pattern** (from `src/commands/add-item.ts` lines 41-49):
```typescript
const user = await prisma.user.findUnique({
  where: { discordId: interaction.user.id },
});

if (!user?.configured) {
  await interaction.editReply(
    "⚠️ You need to configure your languages first with `/setup`.",
  );
  return;
}
```

---

### `src/types/extraction.ts` (NEW) — types

**Analog:** `src/types/session.ts`

**Type export pattern** (from `src/types/session.ts` lines 1-13):
```typescript
import type { ThreadChannel } from "discord.js";

export type SessionStatus = "active" | "ended" | "archived";
export type MessageRole = "user" | "assistant";

export interface ActiveSession {
  id: string;
  thread: ThreadChannel;
  userId: string;
  summary: string;
  messageCount: number;
  correctionCount: number;
}
```

For extraction.ts, use Zod schemas + inferred types:
```typescript
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

---

### `src/prompts/extraction/system.md` (NEW) — prompt

**Analog:** `src/prompts/conversation/system.md`

**Prompt structure pattern** (from `src/prompts/conversation/system.md` lines 1-58):
- Starts with role definition: "You are a native conversation partner..."
- Guidelines section with numbered rules
- Format specification with exact output structure
- Examples showing input → expected output

For extraction/system.md, follow the same structure:
- Role: "You are an extraction assistant for a language learning app..."
- Rules: numbered rules for extraction behavior (typos vs cognitive, code-switching, etc.)
- Format: Zod schema described in natural language
- Examples: optional, since the Zod schema constrains output

---

### `src/events/messageCreate.ts` (MODIFY) — event handler

**Analog:** itself (existing pattern)

**Existing pattern** (lines 1-22):
```typescript
import type { Client, Message } from "discord.js";
import { activeSessions, handleConversationMessage } from "../services/conversation.js";

export function registerMessageCreateHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    const channel = message.channel;
    if (!channel.isThread()) return;
    const session = activeSessions.get(channel.id);
    if (!session) return;
    if (message.author.id !== session.userId) return;

    try {
      await handleConversationMessage(channel, message.author.id, message.content);
    } catch (error) {
      console.error("Error handling conversation message:", error);
    }
  });
}
```

**Modification:** Add extraction enqueue after `handleConversationMessage` completes (inside the try block, after the conversation call). Add imports for `extractionQueue` and `prisma`.

---

### `src/index.ts` (MODIFY) — entry point

**Analog:** itself (existing shutdown pattern)

**Existing shutdown pattern** (lines 20-61):
```typescript
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[${signal}] Graceful shutdown started`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timeout — force exiting");
    process.exit(1);
  }, 10_000);

  try {
    // Save active sessions
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

**Modification:** Add BullMQ cleanup before session saving:
```typescript
// 1. Close extraction worker first
console.log("Closing extraction worker...");
await extractionWorker.close();
console.log("Extraction worker closed");

// 2. Drain extraction queue
console.log("Draining extraction queue...");
await extractionQueue.drain();
console.log("Extraction queue drained");
```

**Startup modification** (from `src/index.ts` lines 70-83):
```typescript
async function main() {
  try {
    await deployCommands();
    console.log("Commands deployed");
  } catch (err) {
    console.warn("Command deployment failed — continuing with login", err);
  }

  await client.login(env.DISCORD_TOKEN);
  console.log("Bot logged in successfully");

  await rehydrateSessions(client);
}
```

Add after `rehydrateSessions(client)`:
```typescript
console.log("Extraction worker initialized (concurrency=1)");
```

---

### `src/commands/index.ts` (MODIFY) — config

**Analog:** itself (existing command registration pattern)

**Existing pattern** (lines 1-16):
```typescript
import type { Command } from "../types/discord.js";
import { command as addItemCommand } from "./add-item.js";
import { command as newCommand } from "./new.js";
import { command as pingCommand } from "./ping.js";
import { command as setupCommand } from "./setup.js";
import { command as endCommand } from "./end.js";
import { command as summaryCommand } from "./summary.js";

export const commands: Command[] = [
  pingCommand,
  setupCommand,
  newCommand,
  endCommand,
  summaryCommand,
  addItemCommand,
];
```

**Modification:** Add import for review command and add to array:
```typescript
import { command as reviewCommand } from "./review.js";

export const commands: Command[] = [
  pingCommand,
  setupCommand,
  newCommand,
  endCommand,
  summaryCommand,
  addItemCommand,
  reviewCommand,
];
```

---

## Shared Patterns

### Authentication / User Guard
**Source:** `src/commands/add-item.ts` lines 41-49
**Apply to:** `src/commands/review.ts`
```typescript
const user = await prisma.user.findUnique({
  where: { discordId: interaction.user.id },
});

if (!user?.configured) {
  await interaction.editReply(
    "⚠️ You need to configure your languages first with `/setup`.",
  );
  return;
}
```

### Error Handling
**Source:** `src/commands/setup.ts` lines 110-121
**Apply to:** `src/commands/review.ts`
```typescript
} catch (error) {
  if (error instanceof Error && error.message.includes("timeout")) {
    await interaction.editReply({
      content: "⏰ [action] timed out. Please try again.",
      components: [],
    });
    return;
  }
  throw error;
}
```

### Graceful Shutdown
**Source:** `src/index.ts` lines 20-61
**Apply to:** `src/index.ts` (modify existing shutdown)
```typescript
// Add before session saving:
await extractionWorker.close();
await extractionQueue.drain();
```

### FSRS Service API
**Source:** `src/services/fsrs.ts`
**Apply to:** `src/services/extraction.ts` (calls `createItem`), `src/commands/review.ts` (calls `getDueItems`, `rateItem`)

**createItem** (lines 32-52):
```typescript
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
      state: card.state,
      due: card.due,
      elapsedDays: card.elapsed_days,
      scheduledDays: card.scheduled_days,
      reps: card.reps,
      lapses: card.lapses,
    },
  });
}
```

**getDueItems** (lines 110-118):
```typescript
export async function getDueItems(userId: string) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: { lte: new Date() },
    },
    orderBy: { due: "asc" },
  });
}
```

**rateItem** (lines 59-105):
```typescript
export async function rateItem(input: RateItemInput) {
  const item = await prisma.reviewItem.findUnique({
    where: { id: input.itemId },
  });
  if (!item) throw new Error(`ReviewItem not found: ${input.itemId}`);

  const card: Card = {
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as Card["state"],
    learning_steps: 0,
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
```

### Prisma Singleton
**Source:** `src/lib/prisma.ts` lines 1-16
**Apply to:** All files that need database access
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### Command Registration
**Source:** `src/commands/index.ts` lines 1-16
**Apply to:** `src/commands/index.ts` (add review command)
```typescript
import type { Command } from "../types/discord.js";
import { command as reviewCommand } from "./review.js";

export const commands: Command[] = [
  // ... existing commands ...
  reviewCommand,
];
```

### Event Handler Registration
**Source:** `src/events/interactionCreate.ts` lines 1-40
**Apply to:** `src/events/messageCreate.ts` (existing pattern, no change needed)
```typescript
import type { Client, Interaction } from "discord.js";
import { commands } from "../commands/index.js";

const commandMap = new Map(
  commands.map((cmd) => {
    const json = cmd.data.toJSON();
    return [json.name, cmd];
  }),
);

export function registerInteractionCreateHandler(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) {
      console.error(`Unknown command: ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply("An error occurred while executing this command.");
      } else {
        await interaction.reply({
          content: "An error occurred while executing this command.",
          ephemeral: true,
        });
      }
    }
  });
}
```

## Data Flow Connections

```
messageCreate.ts (MODIFY)
  │
  │  After handleConversationMessage() returns
  │  Enqueue job to extractionQueue
  ▼
queue.ts (NEW)
  │
  │  extractionWorker processes job (concurrency=1)
  ▼
extraction.ts (NEW)
  │
  │  Calls openai.chat.completions.parse() with zodResponseFormat
  │  For each detectedItem: calls fsrs.createItem()
  ▼
fsrs.ts (EXISTING)
  │
  │  createItem() persists to ReviewItem table
  ▼
PostgreSQL (ReviewItem)

--- Separate flow ---

/review command (review.ts NEW)
  │
  │  getDueItems(userId) → array of due items
  │  showReviewCard() → embed + buttons
  │  awaitMessageComponent() → rating
  │  rateItem(itemId, rating) → updates FSRS state
  │  showReviewCard(next) → recursive until done
  ▼
fsrs.ts (EXISTING)
```

## No Analog Found

All 8 files have close analogs in the existing codebase. No files require external pattern references.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| — | — | — | All files matched |

## Metadata

**Analog search scope:** `src/`, `prisma/`
**Files scanned:** 15 (all .ts files in src/, prisma/schema.prisma)
**Pattern extraction date:** 2026-07-20
