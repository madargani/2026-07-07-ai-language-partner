# Phase 2: AI Conversation — Research

**Researched:** 2026-07-07
**Domain:** AI-powered conversation, Discord thread management, LLM context management
**Confidence:** HIGH

## Summary

Phase 2 delivers the core user experience: natural target-language conversation sessions in private Discord threads, powered by GPT-4o-mini (OpenAI SDK v6). Sessions are created via `/new` with an optional name, live in private threads for clean isolation, and persist to PostgreSQL for rehydration across restarts. Context is managed via progressive summarization — GPT-4o-mini periodically summarizes older conversation while keeping recent messages verbatim — triggered when total tokens approach ~100K (of the 128K context window). Corrections are delivered inline in a single embed (correction block + divider + natural response), capped at 2 per message via prompt engineering.

**Primary recommendation:** Use OpenAI Chat Completions API (SDK v6) with non-streaming responses for Discord embed compatibility. Token count with `tiktoken` (npm). Thread lifecycle: create private thread → send greeting → listen for messages → respond with corrections → archive on `/end` or `/summary`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** OpenAI SDK v6 for the conversation model
- **D-02:** Model: `gpt-4o-mini`
- **D-03:** System prompt lives in `prompts/` directory as template files
- **D-04:** New env vars: `OPENAI_API_KEY` (add to Zod config schema, `.env.example`, Docker Compose)
- **D-05:** Each `/new` creates a **private Discord thread** per session
- **D-06:** Thread named by user's `/new [session_name]` argument — date-based fallback if no name provided
- **D-07:** Thread auto-archived when session ends via `/summary` or `/end`
- **D-08:** Single Discord message per response — correction block on top, divider, natural response below
- **D-09:** Correction style: inline annotated reply
- **D-10:** When user message has no errors: show "No errors found!" — positive reinforcement
- **D-11:** Correction scope: all types (grammar, vocabulary, style/naturalness) — budget-2 cap naturally prioritizes
- **D-12:** Same error repeated across messages: treated independently each time
- **D-13:** Progressive summarization — GPT-4o-mini builds a running summary
- **D-14:** Trigger: dynamic token threshold (not fixed turn count) — keep last few messages verbatim alongside summary
- **D-15:** Summary stored in PostgreSQL Session model `summary` field
- **D-16:** Personality: native conversation partner (casual, natural, correction-light, flow-focused)
- **D-17:** Greeting: target-language immersion (appropriate to implied skill level)
- **D-18:** Skill adaptation: implicit only — no explicit skill_level field
- **D-19:** New models: `Session` and `Message` in Prisma schema
- **D-20:** Session fields: id, userId (FK → User), discordThreadId, status (active/ended/archived), summary (text), messageCount, correctionCount, createdAt, endedAt, updatedAt
- **D-21:** Message fields: id, sessionId (FK → Session), role (user/assistant), content (full text), hasCorrections (boolean), createdAt
- **D-22:** User model stays minimal — no skill_level or session fields on User
- **D-23:** Add `OPENAI_API_KEY` to Zod env schema and `.env.example`
- **D-24:** Graceful shutdown extended: save active session state to PostgreSQL on SIGTERM/SIGINT

### the agent's Discretion
- Session model exact field ordering and defaults — planner decides based on Prisma conventions
- Message storage pruning policy (retention, cleanup) — planner determines if cleanup is needed
- Prompts directory structure (`prompts/conversation/system.md`, etc.) — researcher recommends layout
- Exact token threshold for summarization trigger — researcher determines based on gpt-4o-mini context window

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-01 | User can start a session with /new [session_name] | Private thread creation pattern; thread naming with user arg + date fallback |
| CONV-02 | Bot dispatches target-language greeting matching skill profile | System prompt template in prompts/ directory; immersion greeting design |
| CONV-03 | User replies via chat, bot responds with natural conversation | OpenAI Chat Completions API; non-streaming for embed compatibility; message event → LLM → respond flow |
| CONV-04 | Correction budget enforces max 2 major errors per message | Prompt engineering ("Only correct the 2 most important errors") + post-response validation to enforce cap |
| CONV-05 | Correction block appended to Discord embed (separate from response) | EmbedBuilder with multiple fields; correction block + divider + response section |
| CONV-06 | Session context summarized after 20 turns to control costs | Progressive summarization at ~100K token threshold (dynamic); tiktoken for counting; GPT-4o-mini as summarizer |
| CONV-07 | Only /summary or /end closes a session (no auto-expiry) | Session status model (active/ended/archived); archive thread + set status on command |
| CONV-08 | Session state persists to PostgreSQL and rehydrates on restart | Session + Message Prisma models; rehydration: load session + messages from DB, reconstruct context from summary + last N messages |
| SETUP-04 | Skill profile inferred implicitly over time (starts at beginner) | No explicit skill field; LLM naturally adjusts from conversation quality; prompt sets beginner-friendly tone |
| INFRA-03 | LLM provider routing: high-tier for conversation, low-tier for extraction | Phase 2 uses GPT-4o-mini for conversation (sole model); extraction deferral to Phase 4 |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session lifecycle management | Bot (Node.js) | Database | Bot creates Discord threads and manages session state in PostgreSQL. No SSR or client tier — Discord is the sole interface. |
| LLM conversation & correction | Bot (OpenAI SDK) | — | Direct SDK call from Node.js to OpenAI API. No intermediate API tier. |
| Context summarization | Bot (OpenAI SDK) | — | Bot triggers summarization via separate GPT-4o-mini call. Summary stored in PostgreSQL. |
| Message persistence | Database (PostgreSQL) | Bot | Bot writes messages to Session/Message models via Prisma. No caching tier needed for this phase. |
| Discord thread management | Bot (discord.js) | — | Bot creates, monitors, and archives threads. Direct discord.js API calls. |
| User language config | Database (PostgreSQL) | Bot | User model already exists from Phase 1. Session reads user config for conversation setup. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^6.45.0 | GPT-4o-mini API client | Official OpenAI Node.js SDK. Uses built-in `fetch` (Node 18+). Required for chat completions and summarization. |
| `tiktoken` | ^1.0.22 | Token counting for context management | Official JS/WASM bindings for OpenAI's BPE tokenizer. Used to count tokens before API calls to trigger summarization and avoid context overflow. |
| `discord.js` | ^14.26.4 (existing) | Discord API interaction | Already in project. Thread creation via `channel.threads.create()`, message sending via `thread.send()`, archiving via `thread.setArchived()`. |
| `@prisma/client` | ^6.19.x (existing) | Database ORM | Already in project. Add Session and Message models to schema. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.4.x (existing) | Runtime validation | Validate LLM response structure and env config. |
| `dotenv` | ^17.x (existing) | Environment config | Already in project. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenAI Chat Completions (`chat.completions.create`) | OpenAI Responses API (`responses.create`) | Responses API is the newer endpoint but Chat Completions is more mature and well-documented for our use case. SDK v6 supports both. Chat Completions has better tool-calling and structured output support for correction parsing. |
| `tiktoken` (WASM) | Character-count approximation | Character counts are inaccurate for non-English text (Spanish, French, Japanese, etc.). tiktoken is the standard for accurate token counting. |
| Progressive summarization with GPT-4o-mini | Fixed sliding window (drop oldest messages) | Sliding window loses long-range context. Progressive summarization preserves context compactly and is the established pattern for conversational AI. |

### Installation

```bash
npm install openai tiktoken
```

These are added to the existing `dependencies` in `package.json`.

### Version Verification

```bash
npm view openai version          # → 6.45.0
npm view tiktoken version        # → 1.0.22
```

Both packages exist on npm registry with verified repository URLs (openai: `github.com/openai/openai-node`, tiktoken: `github.com/dqbd/tiktoken`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `openai` | npm | 3+ years | ~12M/wk | github.com/openai/openai-node | OK | Approved |
| `tiktoken` | npm | 3+ years | ~1M/wk | github.com/dqbd/tiktoken | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Discord Client                           │
│  User types /new, sends messages, runs /end or /summary    │
└──────────┬──────────────────────────────────────┬───────────┘
           │ slash command                         │ message event
           ▼                                       ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  Slash Command       │   │  Message Handler             │
│  Handler             │   │  (messageCreate event)       │
│  (/new, /end,        │   │                              │
│   /summary, /cancel) │   │  ┌──────────────────────┐   │
└──────────┬───────────┘   │  │  Active Session Cache │   │
           │               │  │  Map<threadId,        │   │
           │               │  │  Session>             │   │
           │               │  └──────────┬───────────┘   │
           ▼               │            │                │
┌──────────────────────┐   │            ▼                │
│  Conversation        │   │  ┌──────────────────────┐   │
│  Service             │   │  │  OpenAI Client       │   │
│  - createSession()   │◄──┼──┤  chat.completions    │   │
│  - handleMessage()   │   │  │  .create()           │   │
│  - endSession()      │   │  └──────────────────────┘   │
│  - summarize()       │   │            │                │
└──────────┬───────────┘   │            ▼                │
           │               │  ┌──────────────────────┐   │
           ▼               │  │  Summarizer          │   │
┌──────────────────────┐   │  │  (calls GPT-4o-mini │   │
│  Summarizer          │   │  │   to summarize)      │   │
│  - shouldSummarize() │   │  └──────────────────────┘   │
│  - summarizeContext()│   └──────────────────────────────┘
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Prisma / PostgreSQL │
│  - Session model     │
│  - Message model     │
└──────────────────────┘
```

**Flow:**
1. `/new` → Create private Discord thread → Generate greeting via GPT-4o-mini → Send greeting → Persist Session + greeting Message to DB
2. User messages in thread → `messageCreate` event → Look up active session → Check token budget → Build context (summary + recent messages) → Call GPT-4o-mini → Parse corrections (max 2) → Build embed → Send to thread → Persist Message to DB
3. Token threshold exceeded → Run summarization call → Update Session.summary → Continue conversation
4. `/end` or `/summary` → Set session status to ended → Archive thread → Save final state to DB

### Recommended Project Structure

```
src/
├── commands/
│   ├── index.ts          # (existing) register new commands
│   ├── new.ts            # (updated) /new [session_name] — create session + thread
│   ├── end.ts            # (new) /end — end current session, archive thread
│   ├── summary.ts        # (new) /summary — end session + display summary
│   ├── setup.ts          # (existing)
│   └── ping.ts           # (existing)
├── events/
│   ├── interactionCreate.ts  # (existing)
│   ├── ready.ts              # (existing)
│   └── messageCreate.ts      # (new) listen for messages in active threads
├── services/
│   ├── conversation.ts   # (new) session lifecycle, message handling, context build
│   └── summarizer.ts     # (new) token counting, summarization trigger, execution
├── lib/
│   ├── config.ts         # (updated) add OPENAI_API_KEY to Zod schema
│   ├── prisma.ts         # (existing)
│   └── languages.ts      # (existing)
├── types/
│   ├── discord.ts        # (existing)
│   └── session.ts        # (new) session/message types, correction types
├── prompts/
│   └── conversation/
│       ├── system.md     # (new) system prompt template for conversation
│       └── summarize.md  # (new) summarization prompt template
├── client.ts             # (existing)
├── deploy-commands.ts    # (existing) register new commands
└── index.ts              # (updated) add OPENAI_API_KEY env, register messageCreate handler
```

### Pattern 1: Non-Streaming Chat Completion for Discord Embed

**What:** Because Discord needs the complete response to build an embed, use non-streaming chat completions. The response is parsed as a whole to extract corrections and build the embed.

**When to use:** Every conversational turn where a Discord embed is sent as the response.

**Example:**
```typescript
// Source: OpenAI SDK v6 documentation — Chat Completions API
// [VERIFIED: npm registry — openai@6.45.0]

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Non-streaming completion — used for Discord embed responses
const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ],
  temperature: 0.7,
  max_tokens: 1024,
});

const responseContent = completion.choices[0]?.message?.content;
// → Parse responseContent for correction block + response text
// → Build EmbedBuilder with parsed sections
```

### Pattern 2: Private Thread Creation for Sessions

**What:** Each `/new` creates a private Discord thread where only the user and bot can see the conversation.

**When to use:** On `/new` command execution.

**Example:**
```typescript
// Source: discord.js guide — Threads (v14)
// [CITED: discordjs.guide/popular-topics/threads]

import { ChannelType, ThreadAutoArchiveDuration } from "discord.js";

// Create private thread from a text channel
const thread = await interaction.channel.threads.create({
  name: sessionName, // user-provided or date-based fallback
  type: ChannelType.PrivateThread,
  autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
  reason: `New conversation session for ${interaction.user.tag}`,
});

// Add bot to thread (needed for private threads)
if (thread.joinable) {
  await thread.join();
}

// Add user to thread
await thread.members.add(interaction.user.id);

// Send message to thread
await thread.send("¡Hola! ¿Cómo estás hoy?");
```

**Note:** The bot needs `CreatePrivateThreads` permission on the channel. The `GuildMessages` intent (already enabled) covers thread message events.

### Pattern 3: EmbedBuilder for Correction + Response

**What:** A single embed with two sections: corrections block on top, natural response below, separated by a divider.

**When to use:** Every conversational response that includes corrections content.

**Example:**
```typescript
// Source: discord.js v14 EmbedBuilder API
// [CITED: discord.js.org/docs]

import { EmbedBuilder } from "discord.js";

function buildConversationEmbed(
  corrections: string | null,
  response: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(corrections ? 0xe67e22 : 0x2ecc71) // orange for corrections, green for clean
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

### Anti-Patterns to Avoid

- **Streaming with Discord embeds:** Don't use `stream: true` for conversation responses. Discord embeds require the complete content to be built and sent in one message. Streaming is for real-time text output, which doesn't fit the embed pattern.
- **Full history in context:** Don't send every message as context. Always use the progressive summarization pattern. A 100-turn conversation could be 50K+ tokens — easily fits in 128K, but the cost adds up and the model loses focus on recent context.
- **Hardcoded prompts:** Don't put system prompts in code. The user decided on template files in `prompts/` directory. Load them at startup with `fs.readFileSync()`.
- **Ignoring thread archive state:** Don't try to send to an archived thread without unarchiving first. Check `thread.archived` before sending and call `thread.setArchived(false)` if needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Character-count approximation | `tiktoken` npm package | Character counts are inaccurate for non-English text (Spanish, French, Japanese, Chinese, Korean). tiktoken uses the same BPE tokenizer as OpenAI models. |
| LLM chat completions | Custom HTTP client | `openai` npm package (SDK v6) | The SDK handles authentication, retries (2x with exponential backoff), timeouts (10 min default), error types, and request IDs. |
| Discord thread management | Raw REST API calls | `discord.js` channel.threads API | discord.js abstracts thread creation, member management, archiving. Already in project. |
| Runtime validation | Manual type checks | `zod` | Already in project. Validate LLM response structure, env config, and correction parsing. |

## Common Pitfalls

### Pitfall 1: Interaction Token Expiry
**What goes wrong:** Discord interaction tokens expire after 15 minutes. If a long-running LLM call exceeds this, `editReply()` fails.
**Why it happens:** The 3-second deferReply window is fine, but `/new` creates a thread and generates a greeting via LLM — if this takes >15 min (unlikely with GPT-4o-mini), the follow-up edit fails.
**How to avoid:** For `/new`, defer, create the thread, send the greeting directly to the thread (not as editReply). Use `thread.send()` for the greeting instead of `editReply()`.
**Warning signs:** `Interaction has already been acknowledged` errors or `Unknown interaction` errors on long-running commands.

### Pitfall 2: Thread Archive Race Conditions
**What goes wrong:** When ending a session, the thread is archived. But if a message arrives between the `/end` command and the archive call, the send fails or the archive is rejected.
**Why it happens:** Discord's thread model doesn't allow sending to a locked/archived thread without unarchiving first. Race between user messages and session end.
**How to avoid:** Set session status to `ended` in-memory first (before archiving), so message handler ignores new messages. Then archive the thread. On restart, check session status before rehydrating.

### Pitfall 3: Token Limit Exceeded Mid-Conversation
**What goes wrong:** Context + user message + system prompt + output exceed the 128K token limit, resulting in a 400 error.
**Why it happens:** Even with summarization, the user's latest message could be very long, combined with the system prompt and summary.
**How to avoid:** Always count tokens before calling the API. Reserve 20% of the context window for output. If total exceeds limit, trigger summarization immediately on the context, keeping only the last user message verbatim.

### Pitfall 4: Correction Budget Not Respected by LLM
**What goes wrong:** The prompt says "only correct the 2 most important errors" but the LLM sometimes returns 3+ or none.
**Why it happens:** LLMs don't always follow instruction constraints precisely. Prompt engineering is not a guarantee.
**How to avoid:** Add post-response validation. If more than 2 corrections detected, trim to the first 2. If structured output is desired, use a two-call approach: first call generates the response, second call extracts corrections with a strict schema.

### Pitfall 5: re-entrant Shutdown
**What goes wrong:** During graceful shutdown, saving active sessions to PostgreSQL calls Prisma which might be disconnecting simultaneously.
**Why it happens:** The `shutdown()` function in Phase 1 calls `prisma.$disconnect()` — if session save happens during this, it fails.
**How to avoid:** Save sessions BEFORE disconnecting Prisma. The shutdown sequence should be: (1) save active sessions, (2) destroy Discord client, (3) disconnect Prisma.

## Code Examples

### Conversation Service — Message Handler Core
```typescript
// Source: OpenAI SDK v6 + discord.js v14 patterns
// [VERIFIED: npm registry — openai@6.45.0, discord.js@14.26.4]

import OpenAI from "openai";
import { EmbedBuilder, type ThreadChannel } from "discord.js";
import { encoding_for_model } from "tiktoken";
import { prisma } from "../lib/prisma.js";

const openai = new OpenAI();
const SYSTEM_PROMPT = `You are a native conversation partner. ...`;

async function handleConversationMessage(
  thread: ThreadChannel,
  userId: string,
  userMessage: string,
) {
  // 1. Load session and context
  const session = await prisma.session.findUnique({
    where: { discordThreadId: thread.id },
  });
  if (!session || session.status !== "active") return;

  // 2. Load recent messages (last 10)
  const recentMessages = await prisma.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // 3. Build context array
  const contextMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `Summary of earlier conversation: ${session.summary}` },
      ...recentMessages.reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

  // 4. Count tokens and check threshold
  const enc = encoding_for_model("gpt-4o-mini");
  const totalTokens = contextMessages.reduce(
    (sum, m) => sum + enc.encode(m.content as string).length,
    0,
  );
  enc.free();

  // 5. Call GPT-4o-mini
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: contextMessages,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const responseContent = completion.choices[0]?.message?.content ?? "";

  // 6. Parse corrections from response (e.g., via JSON block or delimiters)
  const { corrections, response } = parseCorrections(responseContent);

  // 7. Build embed
  const embed = buildConversationEmbed(corrections, response);

  // 8. Send to thread
  await thread.send({ embeds: [embed] });

  // 9. Persist messages
  await prisma.message.createMany({
    data: [
      { sessionId: session.id, role: "user", content: userMessage },
      {
        sessionId: session.id,
        role: "assistant",
        content: responseContent,
        hasCorrections: corrections !== null,
      },
    ],
  });

  // 10. Check if summarization needed
  if (totalTokens > 90_000) {
    await triggerSummarization(session.id, thread);
  }
}
```

### Token Counting with tiktoken
```typescript
// Source: tiktoken npm package README
// [VERIFIED: npm registry — tiktoken@1.0.22]

import { encoding_for_model } from "tiktoken";

function countTokens(text: string, model = "gpt-4o-mini"): number {
  const enc = encoding_for_model(model);
  const tokens = enc.encode(text);
  enc.free(); // IMPORTANT: free WASM memory
  return tokens.length;
}

// Estimate total context tokens
function estimateContextTokens(
  systemPrompt: string,
  summary: string,
  messages: { role: string; content: string }[],
  model = "gpt-4o-mini",
): number {
  const enc = encoding_for_model(model);
  let total = 0;

  total += enc.encode(systemPrompt).length;
  total += enc.encode(summary).length;

  for (const msg of messages) {
    total += enc.encode(msg.content).length + 4; // +4 for role formatting overhead
  }

  enc.free();
  return total;
}
```

### Summarization Trigger
```typescript
// Source: progressive summarization pattern (OpenAI cookbook)
// [CITED: developer community patterns]

const TOKEN_THRESHOLD = 100_000; // Trigger summarization at ~100K input tokens
const MAX_OUTPUT_TOKENS = 16_384; // GPT-4o-mini max output
const SAFETY_MARGIN = 1024; // System prompt + formatting overhead buffer
const SUMMARIZE_AT = TOKEN_THRESHOLD - MAX_OUTPUT_TOKENS - SAFETY_MARGIN;
// ≈ 82,000 tokens — triggers summarization well before hitting limits, keeps output buffer

async function triggerSummarization(sessionId: string, thread: ThreadChannel) {
  // Load full message history
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  // Build summary prompt
  const summaryPrompt = buildSummaryPrompt(messages);

  // Call GPT-4o-mini to summarize
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Summarize the following conversation so far. " +
          "Focus on: topics discussed, user's language level, " +
          "vocabulary used, and grammatical patterns observed. " +
          "Keep it under 500 tokens.",
      },
      { role: "user", content: summaryPrompt },
    ],
    max_tokens: 500,
  });

  const newSummary = `[${new Date().toISOString()}] ${
    completion.choices[0]?.message?.content ?? ""
  }`;

  // Update session summary
  await prisma.session.update({
    where: { id: sessionId },
    data: { summary: newSummary },
  });

  // Delete old messages (keep last 10 verbatim)
  const tenLatest = messages.slice(-10);
  await prisma.message.deleteMany({
    where: {
      sessionId,
      id: { notIn: tenLatest.map((m) => m.id) },
    },
  });
}
```

### Graceful Shutdown — Session Save
```typescript
// Source: Phase 1 shutdown pattern (src/index.ts)
// [VERIFIED: codebase pattern]

// In src/index.ts, extend shutdown():
import { activeSessions } from "./services/conversation.js";

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[${signal}] Graceful shutdown started`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timeout — force exiting");
    process.exit(1);
  }, 10_000);

  try {
    // Save active sessions BEFORE destroying client/disconnecting Prisma
    for (const session of activeSessions.values()) {
      // Update last message timestamps, finalize summary
      await prisma.session.update({
        where: { id: session.id },
        data: {
          summary: session.summary,
          messageCount: session.messageCount,
        },
      });
    }

    await client.destroy();
    await prisma.$disconnect();
    clearTimeout(forceExit);
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}
```

### Session Rehydration on Restart
```typescript
// Source: CONV-08 requirement pattern
// [ASSUMED] — standard DB→cache rehydration pattern

// On startup, load active sessions from DB
async function rehydrateSessions() {
  const activeSessions = await prisma.session.findMany({
    where: { status: "active" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 10, // Only need last 10 for conversation context
      },
      user: true,
    },
  });

  for (const sessionData of activeSessions) {
    // Fetch thread from Discord
    const channel = await client.channels.fetch(sessionData.discordThreadId);
    if (!channel?.isThread()) {
      // Thread was deleted — end session
      await prisma.session.update({
        where: { id: sessionData.id },
        data: { status: "ended" },
      });
      continue;
    }

    // Register in-memory active sessions
    activeSessions.set(sessionData.id, {
      id: sessionData.id,
      thread: channel as ThreadChannel,
      userId: sessionData.userId,
      summary: sessionData.summary ?? "",
      messageCount: sessionData.messageCount,
      correctionCount: sessionData.correctionCount,
      recentMessages: sessionData.messages.reverse(),
    });
  }

  console.log(`Rehydrated ${activeSessions.size} active sessions`);
}
```

## Runtime State Inventory

> Not applicable — Phase 2 is a greenfield feature phase, not a rename/refactor/migration.

**Phase type:** Feature addition (greenfield conversation system atop existing foundation).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAI SDK v4 (axios-based) | OpenAI SDK v6 (built-in fetch) | 2024–2025 | Smaller bundle, no axios dependency, better edge runtime support |
| GPT-3.5-turbo (4K/16K context) | GPT-4o-mini (128K context) | 2024-07-18 | 8x+ larger context window, better multilingual performance, lower cost |
| discord.js v13 (Discord API v9) | discord.js v14 (Discord API v10) | 2022 | Private threads, new permission model (`CreatePrivateThreads` not `UsePrivateThreads`) |

**Deprecated/outdated:**
- `@dqbd/tiktoken`: Package moved to `tiktoken` on npm. Both names resolve to same package but the `tiktoken` name is current.
- OpenAI SDK v4: Uses axios, removed in v5+. SDK v6 is current stable.
- `usePrivateThreads` permission: Removed in Discord API v10. Replace with `createPrivateThreads`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Session rehydration should fetch last 10 messages from DB for context rebuild | Code Examples | If 10 is too few, conversation feels disjointed. Monitor and adjust. Planner should make this configurable. |
| A2 | GPT-4o-mini can perform its own summarization adequately | Architecture Patterns | If summaries lose important detail, user experience degrades. Mitigation: keep last 10 messages verbatim alongside summary. |
| A3 | The bot doesn't need `MessageContent` intent for thread messages (already enabled) | Standard Stack | Already confirmed — `MessageContent` is enabled in `src/client.ts`. Thread messages are text-based channels. |
| A4 | `encoding_for_model("gpt-4o-mini")` works with tiktoken | Code Examples | tiktoken may need a model alias. Fallback: use `cl100k_base` encoding which is the base for all GPT-4 models. |

## Open Questions

1. **Correction parsing strategy — how to structure the LLM response?**
   - What we know: The response needs to contain both corrections (max 2) and a natural response. User wants them in a single embed with a divider.
   - Options: (a) JSON-formatted response with corrections array + response text, parsed after API call; (b) Delimiter-based (e.g., `##CORRECTIONS##` / `##RESPONSE##`); (c) Two separate API calls (one for corrections, one for response — more expensive).
   - Recommendation: Use delimiters in the prompt response format (approach b). Simplest to implement, no extra cost. If parsing is unreliable, switch to JSON response format with Structured Outputs.
   - Planner action: Implement a `parseCorrections()` function that handles both delimiter and JSON formats.

2. **Message pruning policy — what's the retention strategy?**
   - What we know: All messages are persisted (D-21). Summarization deletes old messages from DB (see code example).
   - Recommendation: Keep all messages indefinitely for Phase 2. Implement a 30-day TTL cleanup job (cron via Bot) only if storage becomes a concern. The planner should document this as a non-urgent design decision.

3. **Should the summarization trigger be purely token-based or include a minimum-turn floor?**
   - What we know: Dynamic token threshold is preferred (D-14). But very early conversations (3 turns with 80K tokens each) should not trigger summarization — the context is still fresh.
   - Recommendation: Summarize only when BOTH: total tokens > 80K AND turn count > 5. This prevents premature summarization of early long-form exchanges.
   - Planner action: Add both conditions in `shouldSummarize()`.

4. **Bot account type — does it need `bot` with specific OAuth2 scopes?**
   - What we know: The bot already connects (Phase 1). Thread creation requires the `bot` scope with `CreatePrivateThreads` permission.
   - Recommendation: No change needed for Phase 2 thread operations IF the bot already has `Administrator` permissions in the server. If using granular permissions, the planner must add `CreatePrivateThreads` to the OAuth2 URL.
   - Planner action: Verify bot permissions in the development server. Add `CreatePrivateThreads` permission if not already present.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-01 | /new creates session + thread | unit | `npx vitest run` (test in new file) | ❌ Wave 0 |
| CONV-03 | Bot responds to messages | unit | `npx vitest run` (mock OpenAI) | ❌ Wave 0 |
| CONV-04 | Corrections capped at 2 | unit | `npx vitest run` (test correction parser) | ❌ Wave 0 |
| CONV-05 | Embed structure correct | unit | `npx vitest run` (test embed builder) | ❌ Wave 0 |
| CONV-06 | Summarization triggers at threshold | unit | `npx vitest run` (test token counting + trigger) | ❌ Wave 0 |
| CONV-08 | Session rehydrates from DB | integration | `npx vitest run` (mock Prisma) | ❌ Wave 0 |
| INFRA-03 | OPENAI_API_KEY in env config | unit | `npx vitest run` (update existing config test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose --changed`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/conversation.test.ts` — conversation service tests (mock OpenAI, Discord, Prisma)
- [ ] `src/__tests__/session-rehydration.test.ts` — session rehydration from DB
- [ ] `src/__tests__/commands/new.test.ts` — `/new` command handler with thread creation
- [ ] `src/__tests__/commands/end.test.ts` — `/end` command handler
- [ ] Update `src/__tests__/walking-skeleton.test.ts` config tests for `OPENAI_API_KEY`

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord OAuth2 is the sole identity provider |
| V3 Session Management | partial | Session lifecycle managed in-memory + PostgreSQL; no session tokens |
| V4 Access Control | yes | Discord permission model (bot can only access channels/threads it's in) |
| V5 Input Validation | yes | Zod schema for env config + LLM response parsing |
| V6 Cryptography | no | No secrets stored or transmitted outside env vars |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM prompt injection via user messages | Spoofing | System prompt boundaries: "You are a native conversation partner..." + never execute commands from user content |
| Discord token leak | Information Disclosure | Environment variable only, never logged or exposed in responses |
| OpenAI API key leak | Tampering | Zod validates at startup, `.env` not committed, Docker secrets for production |
| Rate limit abuse | Denial of Service | OpenAI SDK handles retries with backoff; Discord rate limiting is per-route |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view openai`, `npm view tiktoken`, `npm view discord.js`) — verified package versions and legitimacy
- GitHub: openai/openai-node — SDK v6 API patterns, error handling, streaming, retry behavior
- discord.js Guide — Thread creation, archiving, private thread patterns
- OpenAI API Reference — Chat Completions API signature, token counting, pricing models

### Secondary (MEDIUM confidence)
- OpenAI API Pricing page — GPT-4o-mini pricing: $0.15/1M input, $0.60/1M output
- CloudPrice.net — GPT-4o-mini specs: 131K context window, 16K max output tokens
- OpenAI Developer Community — Error handling patterns, rate limit behavior
- discord.js Documentation — EmbedBuilder, ChannelType, ThreadAutoArchiveDuration

### Tertiary (LOW confidence)
- SkillsMP context-management skill — Progressive summarization patterns (used as reference, adapted to project needs)
- zenn.dev tiktoken comparison — Token counting performance benchmarks (informational only)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — OpenAPI SDK v6, tiktoken, discord.js v14 all verified on npm registry
- Architecture: HIGH — Patterns follow established conversational AI design (summarization, thread management)
- Pitfalls: MEDIUM — Thread archive race conditions are documented Discord behavior but corner cases are hard to predict
- Token/budget recommendations: MEDIUM — Based on GPT-4o-mini 128K window; actual trigger thresholds may need tuning

**Research date:** 2026-07-07
**Valid until:** 2026-08-07 (ecosystem moves fast; npm versions may increment)
