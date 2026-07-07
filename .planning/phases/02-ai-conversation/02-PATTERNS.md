# Phase 2: AI Conversation — Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 20 (10 new, 10 modified)
**Analogs found:** 17 / 20

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/commands/new.ts` | controller (command) | request-response | `src/commands/setup.ts` | exact |
| `src/commands/end.ts` | controller (command) | request-response | `src/commands/ping.ts` | exact |
| `src/commands/summary.ts` | controller (command) | request-response | `src/commands/ping.ts` | exact |
| `src/commands/index.ts` | config (command registry) | — | `src/commands/index.ts` | exact (self) |
| `src/events/messageCreate.ts` | event handler | event-driven | `src/events/interactionCreate.ts` | role-match |
| `src/services/conversation.ts` | service | request-response | `src/lib/languages.ts` | partial |
| `src/services/summarizer.ts` | service | request-response | `src/lib/languages.ts` | partial |
| `src/types/session.ts` | types | — | `src/types/discord.ts` | exact |
| `src/lib/config.ts` | config | — | `src/lib/config.ts` | exact (self) |
| `prisma/schema.prisma` | model | — | `prisma/schema.prisma` (User model) | exact (self) |
| `src/index.ts` | entry | — | `src/index.ts` | exact (self) |
| `src/deploy-commands.ts` | utility | — | `src/deploy-commands.ts` | exact (self) |
| `.env.example` | config | — | `.env.example` | exact (self) |
| `src/prompts/conversation/system.md` | config | — | No analog | none |
| `src/prompts/conversation/summarize.md` | config | — | No analog | none |
| `src/__tests__/walking-skeleton.test.ts` | test | — | `src/__tests__/walking-skeleton.test.ts` | exact (self) |
| `src/__tests__/setup.ts` | test | — | `src/__tests__/setup.ts` | exact (self) |
| `src/__tests__/conversation.test.ts` | test | — | `src/__tests__/walking-skeleton.test.ts` | role-match |
| `src/__tests__/session-rehydration.test.ts` | test | — | `src/__tests__/walking-skeleton.test.ts` | role-match |
| `src/__tests__/commands/new.test.ts` | test | — | `src/__tests__/walking-skeleton.test.ts` | role-match |
| `src/__tests__/commands/end.test.ts` | test | — | `src/__tests__/walking-skeleton.test.ts` | role-match |

## Pattern Assignments

### `src/commands/new.ts` (controller/command, request-response) — MODIFY

**Analog:** `src/commands/setup.ts`

**Imports pattern** (lines 1-11):
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

**Core command export pattern** (lines 13-18):
```typescript
export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure your native and target languages"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
```

**Error handling pattern** (lines 110-121):
```typescript
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
```

**Key pattern adaptations for `/new`:**
- Add `SlashCommandStringOption` to accept optional `session_name` argument (unlike setup.ts which uses select menus)
- Must create a private thread (via `interaction.channel.threads.create()`) and send greeting to thread
- Use `thread.send()` for greeting instead of `editReply()` (per Pitfall 1 in RESEARCH.md)
- User check (line 13-22) pattern from existing `src/commands/new.ts`
- Add `import { ChannelType, ThreadAutoArchiveDuration } from "discord.js"`

---

### `src/commands/end.ts` (controller/command, request-response) — NEW

**Analog:** `src/commands/ping.ts` (simple command, defer+reply pattern)

**Full analog file** (lines 1-14):
```typescript
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
```

**Key adaptations:**
- Add `MessageFlags` import for ephemeral replies
- Add `conversation` service import for `endSession()`
- Start with `interaction.deferReply({ flags: MessageFlags.Ephemeral })`
- Look up active session, set status to ended, archive thread
- Follow `setup.ts` error handling pattern for graceful failure

---

### `src/commands/summary.ts` (controller/command, request-response) — NEW

**Analog:** `src/commands/ping.ts` (same pattern as `/end` — simple command)

**Same pattern as `/end`** above, but:
- Calls `conversation.endSession()` and then displays a summary
- Uses `prisma.message.findMany()` to count stats or fetch summary text
- Uses `EmbedBuilder` to format the summary (new import)

---

### `src/commands/index.ts` (config, command registry) — MODIFY

**Analog:** `src/commands/index.ts` (existing pattern, lines 1-6)
```typescript
import type { Command } from "../types/discord.js";
import { command as newCommand } from "./new.js";
import { command as pingCommand } from "./ping.js";
import { command as setupCommand } from "./setup.js";

export const commands: Command[] = [pingCommand, setupCommand, newCommand];
```

**Key adaptation:**
- Add `import { command as endCommand } from "./end.js";`
- Add `import { command as summaryCommand } from "./summary.js";`
- Add to array: `[pingCommand, setupCommand, newCommand, endCommand, summaryCommand]`

---

### `src/events/messageCreate.ts` (event handler, event-driven) — NEW

**Analog:** `src/events/interactionCreate.ts` (lines 1-40)

**Imports/event registration pattern** (lines 1-9):
```typescript
import type { Client, Interaction } from "discord.js";
import { commands } from "../commands/index.js";

const commandMap = new Map(
  commands.map((cmd) => {
    const json = cmd.data.toJSON();
    return [json.name, cmd];
  }),
);
```

**Event registration function pattern** (lines 11-12):
```typescript
export function registerInteractionCreateHandler(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
```

**Error handling in event handler** (lines 22-38):
```typescript
    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(
        `Error executing command ${interaction.commandName}:`,
        error,
      );
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(
          "An error occurred while executing this command.",
        );
      } else {
        await interaction.reply({
          content: "An error occurred while executing this command.",
          ephemeral: true,
        });
      }
    }
```

**Key adaptations for messageCreate:**
- Export `registerMessageCreateHandler(client: Client): void` — same pattern as interactionCreate.ts
- Filter: only process messages in threads (`channel.isThread()`) where there's an active session
- Ignore messages from bots (`message.author.bot`)
- Look up session from in-memory cache, call conversation service
- Error handling: log error, optionally send `thread.send()` fallback

---

### `src/events/ready.ts` (event handler, event-driven) — FOR REFERENCE

**Pattern** (lines 1-17):
```typescript
import type { Client } from "discord.js";
import { commands } from "../commands/index.js";

export function registerReadyHandler(client: Client): void {
  client.on("ready", () => {
    console.log(`Logged in as ${client.user?.tag}`);
    console.log(`Serving ${client.guilds.cache.size} guilds`);
    console.log(
      `Registered commands: ${commands
        .map((c) => {
          const json = c.data.toJSON();
          return json.name;
        })
        .join(", ")}`,
    );
  });
}
```

**Key adaptation:** Extend to call session rehydration after login log. Add `rehydrateSessions()` call.

---

### `src/services/conversation.ts` (service, request-response) — NEW

**No direct service analog in codebase.** Closest is `src/lib/languages.ts` for data/export pattern, and `src/commands/setup.ts` for prisma interaction pattern.

**Draw from RESEARCH.md code examples (lines 369-455)**:
```typescript
import OpenAI from "openai";
import { EmbedBuilder, type ThreadChannel } from "discord.js";
import { encoding_for_model } from "tiktoken";
import { prisma } from "../lib/prisma.js";

const openai = new OpenAI();
const SYSTEM_PROMPT = `You are a native conversation partner. ...`;
```

**Core conversation handlers to export:**
- `createSession(interaction, sessionName)` — thread creation, greeting generation, DB persistence
- `handleConversationMessage(thread, userId, content)` — context build, LLM call, embed build, DB persist
- `endSession(threadId)` — status update, thread archive
- `getSessionSummary(threadId)` — fetch summary for `/summary` command

**Embed builder pattern** (from RESEARCH.md lines 297-319):
```typescript
import { EmbedBuilder } from "discord.js";

function buildConversationEmbed(
  corrections: string | null,
  response: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(corrections ? 0xe67e22 : 0x2ecc71)
    .setTimestamp();

  if (corrections) {
    embed.addFields({ name: "📝 Corrections", value: corrections });
    embed.addFields({ name: "─".repeat(20), value: "\\u200B", inline: false });
  } else {
    embed.addFields({
      name: "✅ No errors found!",
      value: "Great job! Keep going!",
    });
    embed.addFields({ name: "─".repeat(20), value: "\\u200B", inline: false });
  }

  embed.addFields({ name: "💬 Response", value: response });

  return embed;
}
```

**In-memory active session cache pattern** (from RESEARCH.md lines 627-636):
```typescript
const activeSessions = new Map<string, ActiveSession>();

interface ActiveSession {
  id: string;
  thread: ThreadChannel;
  userId: string;
  summary: string;
  messageCount: number;
  correctionCount: number;
  recentMessages: Message[];
}
```

---

### `src/services/summarizer.ts` (service, request-response) — NEW

**No direct analog.** Research patterns from RESEARCH.md lines 496-551.

**Key exports:**
- `shouldSummarize(contextMessages, threshold)` — token counting + turn threshold check
- `triggerSummarization(sessionId, thread)` — call GPT-4o-mini, update DB, prune messages

**Token counting pattern** (RESEARCH.md lines 458-491):
```typescript
import { encoding_for_model } from "tiktoken";

function countTokens(text: string, model = "gpt-4o-mini"): number {
  const enc = encoding_for_model(model);
  const tokens = enc.encode(text);
  enc.free();
  return tokens.length;
}
```

---

### `src/types/session.ts` (types, —) — NEW

**Analog:** `src/types/discord.ts` (lines 1-10)
```typescript
import type {
  CommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: CommandInteraction) => Promise<void>;
}
```

**Key adaptation — define session types:**
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

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}
```

---

### `src/lib/config.ts` (config, —) — MODIFY

**Analog:** `src/lib/config.ts` (self, lines 1-16)
```typescript
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),
  REDIS_URL: z.string().url("REDIS_URL must be a valid URL"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DISCORD_GUILD_ID: z.string().optional(),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
```

**Key change:** Add `OPENAI_API_KEY` field:
```typescript
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
```

---

### `prisma/schema.prisma` (model, —) — MODIFY

**Analog:** `prisma/schema.prisma` (self, lines 10-18)
```prisma
model User {
  id             String   @id @default(uuid())
  discordId      String   @unique
  nativeLanguage String
  targetLanguage String
  configured     Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**Add Session and Message models** (following same style):
```prisma
model Session {
  id             String    @id @default(uuid())
  userId         String
  user           User       @relation(fields: [userId], references: [id])
  discordThreadId String   @unique
  status         String    @default("active")
  summary        String?
  messageCount   Int       @default(0)
  correctionCount Int      @default(0)
  createdAt      DateTime  @default(now())
  endedAt        DateTime?
  updatedAt      DateTime  @updatedAt
  messages       Message[]

  @@index([userId])
  @@index([status])
}

model Message {
  id             String   @id @default(uuid())
  sessionId      String
  session        Session  @relation(fields: [sessionId], references: [id])
  role           String
  content        String
  hasCorrections Boolean  @default(false)
  createdAt      DateTime @default(now())

  @@index([sessionId])
  @@index([createdAt])
}
```

**Also add to User model:**
```prisma
  sessions       Session[]
```

---

### `src/index.ts` (entry, —) — MODIFY

**Analog:** `src/index.ts` (self)

**Imports pattern** (lines 1-7):
```typescript
import "dotenv/config";
import { client } from "./client.js";
import { deployCommands } from "./deploy-commands.js";
import { registerInteractionCreateHandler } from "./events/interactionCreate.js";
import { registerReadyHandler } from "./events/ready.js";
import { env } from "./lib/config.js";
import { prisma } from "./lib/prisma.js";
```

**Key additions:**
- Add `import { registerMessageCreateHandler } from "./events/messageCreate.js";`
- Add `import { rehydrateSessions } from "./services/conversation.js";`
- Add after line 11: `registerMessageCreateHandler(client);`

**Graceful shutdown pattern** (lines 17-47):
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

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

**Key changes to shutdown:**
- Save active sessions BEFORE `client.destroy()` (per D-24 and RESEARCH.md Pitfall 5)
- Add `import { activeSessions } from "./services/conversation.js";`
- Insert save loop before `client.destroy()`:
  ```typescript
  // Save active sessions before destroying client
  for (const session of activeSessions.values()) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        summary: session.summary,
        messageCount: session.messageCount,
      },
    });
  }
  ```

**Rehydration after login** — add inside `main()` after login:
```typescript
  await rehydrateSessions();
```

---

### `src/deploy-commands.ts` (utility, —) — No Code Change Needed

The deploy-commands.ts file reads from `commands/index.ts`, so adding imports there covers new commands automatically. No code change required.

---

### `.env.example` (config, —) — MODIFY

**Analog:** `.env.example` (self, lines 1-16)

**Add after the Discord section:**
```env
# OpenAI
OPENAI_API_KEY=your_openai_api_key_here
```

---

### `src/prompts/conversation/system.md` (config, —) — NEW

**No analog in codebase.** Use RESEARCH.md guidance.

**System prompt content** (per D-16, D-17, D-18):
- Personality: native conversation partner (casual, natural, correction-light, flow-focused)
- Skill adaptation: implicit only
- Correction budget: max 2 per message, all types (grammar, vocabulary, style)
- Response format: delimiter-based (e.g., `##CORRECTIONS##` / `##RESPONSE##`)
- No errors case: show "No errors found!"

---

### `src/prompts/conversation/summarize.md` (config, —) — NEW

**No analog in codebase.** Use RESEARCH.md guidance.

**Summarization prompt context** (RESEARCH.md lines 522-528):
- Focus on: topics discussed, user's language level, vocabulary used, grammatical patterns observed
- Keep under 500 tokens
- Includes timestamp prefix in result

---

### `src/__tests__/setup.ts` (test, —) — MODIFY

**Analog:** `src/__tests__/setup.ts` (self)

**Add Session/Message mocks to mockPrisma** (lines 7-26):
```typescript
type PrismaMock = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  session: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  message: {
    create: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  $disconnect: ReturnType<typeof vi.fn>;
  $connect: ReturnType<typeof vi.fn>;
  $on: ReturnType<typeof vi.fn>;
};

const mock: PrismaMock = {
  user: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(null),
  },
  session: {
    create: vi.fn().mockResolvedValue({ id: "session-1", status: "active" }),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
  },
  message: {
    create: vi.fn().mockResolvedValue(null),
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    findMany: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  $disconnect: vi.fn().mockResolvedValue(undefined),
  $connect: vi.fn().mockResolvedValue(undefined),
  $on: vi.fn(),
} as any;
```

**Also add `OPENAI_API_KEY` to test env vars** (line 57-61):
```typescript
process.env.OPENAI_API_KEY = "test-openai-key";
```

---

### `src/__tests__/walking-skeleton.test.ts` (test, —) — MODIFY

**Analog:** `src/__tests__/walking-skeleton.test.ts` (self)

**Add test inside "Config validation" describe block:**
```typescript
  it("throws when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(async () => {
      await import("../lib/config.js");
    }).rejects.toThrow();
  });
```

---

### `src/__tests__/conversation.test.ts` (test, —) — NEW

**Analog:** `src/__tests__/walking-skeleton.test.ts` (test patterns)

**Test pattern to follow** (walking-skeleton.test.ts lines 82-89):
```typescript
describe("Prisma singleton", () => {
  it("importing prisma returns a PrismaClient instance", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { prisma } = await import("../lib/prisma.js");

    expect(prisma).toBeDefined();
    expect(PrismaClient).toHaveBeenCalled();
  });
});
```

**Test structure for conversation service:**
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "../setup.js";

describe("Conversation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds context from summary + recent messages", async () => {
    // Mock session + messages
    // Call the context builder
    // Verify structure
  });

  it("calls OpenAI with correct messages array", async () => {
    // Mock openai.chat.completions.create
    // Call handleConversationMessage
    // Verify API call shape
  });

  it("caps corrections at max 2", async () => {
    // Mock response with 5 corrections
    // Call parseCorrections
    // Verify only 2 returned
  });

  it("builds embed with corrections block + divider + response", async () => {
    // Test buildConversationEmbed shape
  });
});
```

---

### `src/__tests__/session-rehydration.test.ts` (test, —) — NEW

**Analog:** `src/__tests__/walking-skeleton.test.ts`

**Test structure:**
```typescript
describe("Session Rehydration", () => {
  it("loads active sessions from DB on startup", async () => {
    // Mock prisma.session.findMany to return active sessions
    // Call rehydrateSessions
    // Verify active sessions cache populated
  });

  it("ends sessions whose threads were deleted", async () => {
    // Mock channel.fetch to reject
    // Verify status set to ended
  });

  it("skips non-active sessions", async () => {
    // Mock only active sessions returned
    // Verify only active ones in cache
  });
});
```

---

### `src/__tests__/commands/new.test.ts` (test, —) — NEW

**Analog:** `src/__tests__/walking-skeleton.test.ts` (lines 192-227 — existing `/new` test)

**Test structure (extend existing patterns):**
```typescript
describe("/new command", () => {
  it("creates private thread and sends greeting for configured user", async () => {
    // Mock user as configured
    // Mock thread creation
    // Verify thread.create called with correct params
    // Verify greeting sent to thread
  });

  it("requires /setup first for unconfigured user", async () => {
    // Existing pattern from walking-skeleton.test.ts
  });
});
```

---

## Shared Patterns

### Command Export Pattern
**Source:** `src/commands/ping.ts` (lines 1-14)
**Apply to:** All command files (`new.ts`, `end.ts`, `summary.ts`)
```typescript
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("command-name")
    .setDescription("Description text"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // ... handler logic
  },
};
```

### Event Handler Registration Pattern
**Source:** `src/events/interactionCreate.ts` (lines 11-12)
**Apply to:** `src/events/messageCreate.ts`
```typescript
export function registerMessageCreateHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    // ... handler logic
  });
}
```

### Event Handler Registration in Index
**Source:** `src/index.ts` (lines 10-11)
**Apply to:** Registration of messageCreate handler
```typescript
registerReadyHandler(client);
registerInteractionCreateHandler(client);
registerMessageCreateHandler(client);  // ADD
```

### Prisma Singleton Pattern
**Source:** `src/lib/prisma.ts` (lines 1-16)
**Apply to:** All files using Prisma
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

### Zod Env Config Pattern
**Source:** `src/lib/config.ts` (lines 1-16)
**Apply to:** Adding OPENAI_API_KEY
```typescript
import { z } from "zod";

const envSchema = z.object({
  // ... existing fields ...
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
});
```

### Prisma Model Pattern
**Source:** `prisma/schema.prisma` (User model, lines 10-18)
**Apply to:** Session and Message models
```prisma
model ModelName {
  id        String   @id @default(uuid())
  // ... fields ...
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Test File Pattern
**Source:** `src/__tests__/walking-skeleton.test.ts` (lines 1, 96-106)
**Apply to:** New test files
```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
// ... imports ...

describe("Feature name", () => {
  it("does something specific", async () => {
    // Arrange, Act, Assert
  });
});
```

### Mock Setup Pattern
**Source:** `src/__tests__/setup.ts` (lines 7-32)
**Apply to:** Adding Session/Message mocks
```typescript
const { mockPrisma } = vi.hoisted(() => {
  // Define mock shapes with typed mocks
  const mock: PrismaMock = { ... };
  return { mockPrisma: mock };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(function () {
    return mockPrisma;
  }),
}));
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/services/conversation.ts` | service | request-response | No service layer exists yet in codebase |
| `src/services/summarizer.ts` | service | request-response | No service layer exists yet in codebase |
| `src/prompts/conversation/system.md` | config | — | No prompt template directory yet |
| `src/prompts/conversation/summarize.md` | config | — | No prompt template directory yet |

**Guidance for service files:** Follow the RESEARCH.md code examples (lines 369-551) for OpenAI SDK v6 usage patterns, tiktoken token counting, and progressive summarization. Export named functions (not a class) with clear responsibility boundaries:
- `conversation.ts`: session lifecycle, message handling, embed building, correction parsing, active session cache
- `summarizer.ts`: token counting, threshold checking, summarization execution, message pruning

## Metadata

**Analog search scope:** `src/commands/`, `src/events/`, `src/lib/`, `src/types/`, `src/__tests__/`, `prisma/`
**Files scanned:** 16 existing + root config files
**Pattern extraction date:** 2026-07-07
