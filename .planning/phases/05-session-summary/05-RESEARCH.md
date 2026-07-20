# Phase 5: Session Summary — Research

**Researched:** 2026-07-21
**Domain:** Post-session insights (LLM strength analysis, FSRS queue health, expansion metrics), Prisma schema evolution, Discord embed enhancement
**Confidence:** HIGH

## Summary

Phase 5 enhances the existing `/summary` command (Phase 2) to deliver actionable post-session insights: top 3 strengths derived from LLM analysis of the conversation, vocabulary expansion metrics (count of ReviewItems auto-extracted during the session via the Phase 4 pipeline), and review queue health (items due within 24h). A new `SessionSummary` Prisma model persists the computed data with a 1:1 relation to Session. The `ReviewItem` model gains an optional `sessionId` FK so expansion counts can be attributed to the correct session.

All the required infrastructure already exists: the extraction pipeline already stamps `sessionId` on job payloads (Phase 4), the FSRS service provides `getDueItems()` which can be adapted for 24h window queries, the LLM client is already wired, and the embed builder pattern is well-established. This phase is primarily about **wiring existing capabilities together** — no new external dependencies, no new services, no new infrastructure.

**Primary recommendation:** Three conceptual changesets: (1) Schema: add `sessionId` to ReviewItem + create `SessionSummary` model + migration, (2) Code: pass `sessionId` through extraction pipeline to `createItem()`, add strength analysis + expansion/queue queries to conversation service, (3) UX: enhance the summary embed with the three new data fields and create SessionSummary atomically when the session ends.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use LLM analysis of conversation to determine top 3 strengths — NOT ReviewItem rating tracking or session-based rating queries
- **D-02:** Use the existing `CONVERSATION_MODEL` (gpt-4o-mini) for strength analysis. No new LLM provider or model key needed
- **D-03:** Output format: specific vocabulary/grammar terms the user handled well, with brief explanations
- **D-04:** Strength analysis runs ONCE at `/summary` time, not progressively during conversation
- **D-05:** Strengths are computed on-the-fly at display time — NOT persisted to the database. No new fields or migrations needed for strengths
- **D-06:** Add an optional nullable `sessionId` FK field on the `ReviewItem` Prisma model (FK → Session)
- **D-07:** The extraction worker (`src/services/extraction.ts`) sets `sessionId` at creation time only. Existing dedup logic (findFirst on userId+source+type) skips duplicates — no sessionId is overwritten
- **D-08:** Summary query counts ReviewItems where `sessionId` matches the current session. This handles concurrent sessions correctly
- **D-09:** Display as raw count: `📚 Queue: X due in 24h` — no qualitative labels, no type breakdown
- **D-10:** Query uses `updatedAt` within the session time window or a new FSRS service function for queue health within 24h
- **D-11:** Create a new `SessionSummary` Prisma model with 1:1 relation to Session (unique FK)
- **D-12:** SessionSummary fields: `sessionId` (FK, unique), `strengths` (JSON), `expandedCount` (Int), `queueHealth` (Int), plus the existing LLM `summary` text carried forward from Session. Timestamps (createdAt, updatedAt)
- **D-13:** SessionSummary is created atomically when `/summary` terminates the session — written alongside the Session status update

### the agent's Discretion

- Exact SessionSummary field ordering, defaults, and column attributes — planner follows Prisma conventions
- LLM prompt for strength analysis — researcher recommends based on the existing conversation and extraction prompt patterns
- SessionSummary creation timing — whether to use a Prisma transaction with the session end update
- Embed layout for the enhanced summary — how to arrange the 3 new fields alongside existing ones (embeds have 25-field limit, so order matters)
- FSRS service: whether to add a `getQueueHealth(userId)` function or query directly in the summary command

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUMM-01 | /summary terminates session and aggregates session data | Existing flow in `summary.ts` + `conversation.ts` — enhance `getSessionSummary()` and `endSession()`. Session termination already works (sets status="ended", endedAt). |
| SUMM-02 | Embed displays top 3 strengths | New LLM strength analysis call at summary time. Requires: strength prompt file + inline LLM call before transaction. |
| SUMM-03 | Embed displays expansion metrics (new items auto-extracted) | Count ReviewItems where `sessionId` matches current session. Extraction pipeline already stamps `sessionId` on job payloads — just needs to pass it to `createItem()`. |
| SUMM-04 | Embed displays queue health (items due in next 24h) | Count ReviewItems where `userId` matches and `due` is within [now, now+24h]. Can use an adapted `getDueItems()` or inline Prisma query. |
| SUMM-05 | Summary persists to PostgreSQL for historical tracking | New `SessionSummary` model created atomically with session end. Stores strengths (JSON), expandedCount, queueHealth, and session summary text. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Strength analysis (LLM) | Bot (OpenAI SDK — inline call) | — | Called synchronously during `/summary` command via existing OpenAI SDK. No background processing needed — analysis is fast (<2s on gpt-4o-mini). |
| Expansion metrics query | Database (PostgreSQL via Prisma) | Bot (Prisma query) | Count of ReviewItems with matching sessionId. Simple `prisma.reviewItem.count()`. |
| Queue health query | Database (PostgreSQL via Prisma) | Bot (Prisma query) | Count of ReviewItems with due within 24h window for this user. |
| Historical persistence | Database (PostgreSQL via Prisma) | Bot (command handler) | SessionSummary created in same transaction as session end. |
| Embed display | Bot (discord.js EmbedBuilder) | — | Enhanced `/summary` command builds richer embed with 3 new fields. No UI rendering tier. |
| sessionId tracking for items | Extraction worker → FSRS service → Database | — | Phase 4 extraction passes sessionId from job payload through to `createItem()`, which stores it on ReviewItem. |

## Standard Stack

### Core (All existing — no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `discord.js` (existing) | ^14.26.x | EmbedBuilder, slash commands | Already in project. Enhanced embed needs no new discord.js features. |
| `openai` (existing) | ^6.x | LLM strength analysis | Already in project. Use `chat.completions.create()` (not `parse()`) for strength analysis since output is free-text formatted strengths. |
| `@prisma/client` (existing) | ^6.19.x | Database queries, transactions | Already in project. New migration adds ReviewItem.sessionId + SessionSummary model. |
| `ts-fsrs` (existing) | ^5.4.x | Queue health uses ReviewItem.due field | Already in project. Queue health is a simple date-range query, no ts-fsrs logic needed. |

## Package Legitimacy Audit

**No new npm packages required for this phase.** All work uses existing dependencies. The phase adds:
- A Prisma migration (no new package)
- Modifications to existing TypeScript files (no new imports)
- A new prompt file for strength analysis (plain text, no package)

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**Packages verified OK:** Prisma migrate handles schema changes using existing `@prisma/client@^6.19.0` and `prisma@^6.19.0`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Discord Client                                   │
│  User runs /summary                                                          │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  src/commands/summary.ts (ENHANCED)                                         │
│                                                                             │
│  1. deferReply()                                                            │
│  2. Call ENHANCED getSessionSummary(userId) → computes ALL data:            │
│     ├─ messageCount, correctionCount, duration (existing)                   │
│     ├─ strengths[] — via LLM analysis of conversation messages              │
│     ├─ expansionCount — prisma.reviewItem.count({ where: { sessionId } })   │
│     └─ queueHealth — prisma.reviewItem.count({ where: { userId, due } })    │
│  3. Build enhanced embed with all data                                      │
│  4. Prisma $transaction:                                                    │
│     ├─ prisma.session.update({ status: "ended", endedAt })                  │
│     └─ prisma.sessionSummary.create({ strengths, expandedCount, ... })      │
│  5. interaction.editReply({ embeds: [embed] })                              │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
┌────────────────────┐ ┌──────────────┐ ┌──────────────────┐
│ OpenAI (gpt-4o-mini)│ │  Prisma      │ │  Prisma          │
│ Strength analysis  │ │  ReviewItem  │ │  SessionSummary   │
│ → top 3 specific   │ │  count by    │ │  create + Session │
│   strengths with   │ │  sessionId   │ │  update (atomic   │
│   explanations     │ │  & due window│ │  transaction)     │
└────────────────────┘ └──────────────┘ └──────────────────┘
```

**Primary flow:**
1. User runs `/summary` → `deferReply({ flags: Ephemeral })`
2. `getSessionSummary()` enhanced to:
   a. Find active session (existing)
   b. Compute duration (existing)
   c. Fetch all conversation messages for this session
   d. Call `openai.chat.completions.create()` with strength analysis prompt → parse 3 strengths
   e. Count ReviewItems with `sessionId` matching current session → expansionCount
   f. Count ReviewItems where `due` is within [now, now+24h] for this user → queueHealth
3. Build embed with: Messages | Corrections | Duration | Strengths | Expansion | Queue Health | Summary text
4. Prisma `$transaction` to atomically end the session AND create SessionSummary
5. Send embed

### Data Flow for Expansion Metrics (D-06, D-07, D-08)

```
Phase 4 messageCreate.ts:              Phase 5 summary.ts:
  extractionQueue.add({                   await prisma.reviewItem.count({
    ...                                    where: { sessionId: activeSession.id }
    sessionId: session.id,  ──────────┐  })
  })                                  │
        │                            │
        ▼                            │
Phase 4 extraction.ts:                │
  processExtractionJob(data)          │
    → createItem({                    │
        sessionId: data.sessionId,  ──┘  ← NEW: pass sessionId through
        userId, source, type, lang
      })

Key: sessionId is set ONLY at creation time (D-07).
Dedup (findFirst on userId+source+type) skips creation for duplicates —
no sessionId overwrite. Count is accurate for items extracted THIS session.
```

### Data Flow for Queue Health (D-09, D-10)

```
Queue health = count of ReviewItems where:
  - userId = <current user's internal id>
  - due >= now AND due <= now + 24 hours

The `due` field on ReviewItem is set by ts-fsrs during:
  - createItem() → createEmptyCard(now) → due = now (immediately due for new cards)
  - rateItem() → scheduler.next() → updates due based on rating

Query: prisma.reviewItem.count({
  where: {
    userId: user.id,
    due: { gte: now, lte: add24h },
  },
})
```

### Timing: Strength Analysis Inline vs Background

D-04 says strength analysis runs ONCE at `/summary` time. The LLM call is **synchronous** during the command execution:

```
User runs /summary
  → deferReply() [3 second window met]
  → getSessionSummary()
    → fetch messages (~10ms)
    → LLM strength analysis (~1-2s on gpt-4o-mini)
    → count expansions (~5ms)
    → count queue health (~5ms)
  → build embed (~2ms)
  → transaction: end session + create SessionSummary (~20ms)
  → editReply
Total: ~1.5-2.5 seconds

This fits within deferred reply limits (15 minutes). The user waits ~2s for
the summary to appear, which is acceptable for this infrequent command.
```

### Recommended Project Structure (Changes Only)

```
src/
├── commands/
│   └── summary.ts              # MODIFY — enhanced embed, transaction
├── services/
│   ├── conversation.ts         # MODIFY — extended getSessionSummary(), endSession()/new atomic fn
│   ├── fsrs.ts                 # MODIFY — add optional sessionId param to createItem()
│   └── extraction.ts           # MODIFY — pass sessionId from job payload to createItem()
├── prompts/
│   └── conversation/
│       ├── system.md           # EXISTING — no change
│       ├── summarize.md        # EXISTING — no change
│       └── strengths.md        # NEW — strength analysis prompt for top 3 strengths
├── types/
│   └── session.ts              # MODIFY — update SessionSummary return type
prisma/
├── schema.prisma               # MODIFY — add sessionId to ReviewItem, add SessionSummary model
└── migrations/                  # NEW — auto-generated by `prisma migrate dev`
```

### Pattern 1: Prisma Schema — Add sessionId to ReviewItem + Create SessionSummary

```prisma
// Source: CONTEXT.md D-06, D-11, D-12 — locked decisions
// [ASSUMED — derived from decisions, schema follows existing conventions]

model ReviewItem {
  // ... existing fields ...
  sessionId String?              // NEW: optional FK → Session (D-06)
  session   Session?  @relation(fields: [sessionId], references: [id])

  @@index([sessionId])           // NEW: index for expansion metrics queries
  @@index([userId])
  @@index([userId, due])
  @@index([userId, type])
}

model SessionSummary {
  id            String   @id @default(uuid())
  sessionId     String   @unique                       // 1:1 FK → Session
  session       Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  strengths     Json                                   // JSON array of strength objects
  expandedCount Int      @default(0)
  queueHealth   Int      @default(0)
  summary       String   @default("")                  // Session summary text, carried forward
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([sessionId])
}
```

**Key design decisions:**
- `sessionId` on ReviewItem is **optional** (String?) — existing items without sessionId are valid. D-06 specifies "optional nullable."
- `SessionSummary.sessionId` is **unique** — enforces 1:1 relation per session. D-11 specifies unique FK.
- `onDelete: Cascade` — if a Session is deleted, its summary goes too. Matches the Message-Session relation convention.
- `strengths` is `Json` — Prisma's JSON column maps naturally to the LLM output array. No separate table needed.
- `summary` is carried forward from `Session.summary` (set by the summarizer service during conversation), not re-generated.

### Pattern 2: FSRS Service — Add optional sessionId to createItem()

```typescript
// Source: CONTEXT.md D-06, D-07 — sessionId on ReviewItem
// [ASSUMED — extends existing CreateItemInput type]

// src/services/fsrs.ts — modify CreateItemInput and createItem()

export interface CreateItemInput {
  userId: string;
  source: string;
  type: ItemType;
  language: string;
  sessionId?: string;             // NEW: optional — set by extraction worker
}

export async function createItem(input: CreateItemInput) {
  const now = new Date();
  const card: Card = createEmptyCard(now);

  return prisma.reviewItem.create({
    data: {
      userId: input.userId,
      source: input.source,
      type: input.type,
      language: input.language,
      sessionId: input.sessionId,  // NEW: optional FK
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

### Pattern 3: Extraction Worker — Pass sessionId to createItem()

```typescript
// Source: CONTEXT.md D-07 — extraction worker sets sessionId at creation time
// [ASSUMED — extraction.ts already has sessionId in job payload]

// src/services/extraction.ts — modify the createItem() call

export async function processExtractionJob(
  data: ExtractionJobPayload,
): Promise<void> {
  // ... existing LLM call logic ...

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
        // D-07: dedup — skip existing, do NOT overwrite sessionId
        continue;
      }

      await createItem({
        userId: data.userId,
        source: item.source,
        type: item.type,
        language: data.targetLanguage,
        sessionId: data.sessionId,     // ← NEW: pass sessionId from job payload
      });
    } catch (err) {
      console.error("Failed to create item:", item.source, err);
    }
  }
}
```

### Pattern 4: Enhanced getSessionSummary() with Strengths, Expansion, Queue Health

```typescript
// Source: CONTEXT.md D-01, D-04, D-05, D-08, D-10
// [ASSUMED — extends existing getSessionSummary() with new data]

// ─── Return type for the enhanced summary ───────────────────────────────────

export interface SessionSummaryResult {
  messageCount: number;
  correctionCount: number;
  summary: string;
  duration: string;
  strengths: string[];           // NEW: 3 strength descriptions
  expansionCount: number;        // NEW: count of ReviewItems for this session
  queueHealth: number;           // NEW: count of items due within 24h
}

// ─── New function: analyze strengths via LLM ────────────────────────────────

async function analyzeStrengths(
  messages: { role: string; content: string }[],
  targetLanguage: string,
): Promise<string[]> {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = fs.readFileSync(
    path.join(__dirname, "..", "prompts", "conversation", "strengths.md"),
    "utf-8",
  );

  const completion = await openai.chat.completions.create({
    model: env.CONVERSATION_MODEL,   // D-02: use CONVERSATION_MODEL
    messages: [
      {
        role: "system",
        content: prompt.replace("{{targetLanguage}}", targetLanguage),
      },
      { role: "user", content: conversationText },
    ],
    temperature: 0.3,  // Low temp for consistent analysis
    max_tokens: 500,
  });

  const text = completion.choices[0]?.message?.content ?? "";
  // Parse: each line is a strength, or format as "• Strength: explanation"
  // Keep parsing simple — each line is one strength item
  return text
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);  // D-01: top 3 strengths
}

// ─── Enhanced getSessionSummary() ───────────────────────────────────────────

export async function getSessionSummary(
  userId: string,
): Promise<SessionSummaryResult | null> {
  for (const [_threadId, session] of activeSessions) {
    if (session.userId === userId) {
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
        include: { user: true },
      });
      if (!dbSession) return null;

      // Duration (existing logic)
      const startTime = dbSession.createdAt.getTime();
      const now = Date.now();
      const diffMs = now - startTime;
      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const minutes = diffMin % 60;
      const duration =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

      // === NEW: Fetch data for enhanced summary ===

      // 1. Fetch conversation messages for strength analysis
      const messages = await prisma.message.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
      });

      // 2. Strengths via LLM (D-04: runs ONCE at summary time)
      const strengths = await analyzeStrengths(
        messages.map((m) => ({ role: m.role, content: m.content })),
        dbSession.user.targetLanguage,
      );

      // 3. Expansion metrics (D-08: count ReviewItems with matching sessionId)
      const expansionCount = await prisma.reviewItem.count({
        where: { sessionId: session.id },
      });

      // 4. Queue health (D-10: items due within 24h)
      const nowDate = new Date();
      const add24h = new Date(nowDate.getTime() + 24 * 60 * 60 * 1000);
      const queueHealth = await prisma.reviewItem.count({
        where: {
          userId: dbSession.userId,
          due: { gte: nowDate, lte: add24h },
        },
      });

      return {
        messageCount: session.messageCount,
        correctionCount: session.correctionCount,
        summary: dbSession.summary ?? "No summary available.",
        duration,
        strengths,
        expansionCount,
        queueHealth,
      };
    }
  }
  return null;
}
```

### Pattern 5: Atomic Transaction — End Session + Create SessionSummary

```typescript
// Source: CONTEXT.md D-13 — atomic creation with session status update
// [ASSUMED — Prisma $transaction pattern from Prisma docs on pg transactions]

// src/commands/summary.ts — enhanced command

import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { endSession, getSessionSummary } from "../services/conversation.js";
import { prisma } from "../lib/prisma.js";
import type { Command } from "../types/discord.js";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("summary")
    .setDescription("End your session and see a summary"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Step 1: Compute all summary data (includes inline LLM call for strengths)
    const summary = await getSessionSummary(interaction.user.id);

    if (!summary) {
      await interaction.editReply("You don't have an active session.");
      return;
    }

    // Step 2: Build the enhanced embed
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📊 Session Summary")
      .addFields(
        // Existing fields
        { name: "Messages", value: String(summary.messageCount), inline: true },
        { name: "Corrections", value: String(summary.correctionCount), inline: true },
        { name: "Duration", value: summary.duration, inline: true },
        // NEW: Strengths (D-01, D-03)
        { name: "🏆 Strengths", value: summary.strengths.map((s, i) => `**${i+1}.** ${s}`).join("\n") || "None identified" },
        // NEW: Expansion metrics (SUMM-03)
        { name: "📖 New Items", value: `${summary.expansionCount} items extracted this session`, inline: true },
        // NEW: Queue health (D-09)
        { name: "📚 Queue", value: `${summary.queueHealth} due in 24h`, inline: true },
      )
      .setTimestamp();

    if (summary.summary) {
      embed.addFields({ name: "📝 Summary", value: summary.summary });
    }

    // Step 3: Atomic transaction (D-13) — end session + create SessionSummary
    await prisma.$transaction([
      // End session (existing endSession logic, but inline in transaction)
      prisma.session.update({
        where: { id: sessionId },  // Need sessionId from getSessionSummary
        data: {
          status: "ended",
          endedAt: new Date(),
          messageCount: summary.messageCount,
          correctionCount: summary.correctionCount,
        },
      }),
      // Create SessionSummary record (D-11, D-12)
      prisma.sessionSummary.create({
        data: {
          sessionId: sessionId,  // Need sessionId from the active session
          strengths: summary.strengths,  // JSON array
          expandedCount: summary.expansionCount,
          queueHealth: summary.queueHealth,
          summary: summary.summary,
        },
      }),
    ]);

    // Step 4: Clean up in-memory session
    // Note: endSession() logic must be modified — active session removal
    // and thread archiving happen OUTSIDE the transaction (no DB dependency)
    for (const [threadId, session] of activeSessions) {
      if (session.userId === interaction.user.id) {
        activeSessions.delete(threadId);
        try {
          await session.thread.setArchived(true);
        } catch { /* thread may already be archived */ }
        break;
      }
    }

    // Step 5: Send the embed
    await interaction.editReply({ embeds: [embed] });
  },
};
```

**Critical note on implementation:** The current `endSession()` function in `conversation.ts` both updates the DB and cleans up in-memory state (Map delete + thread archive). For Phase 5, `endSession()` must be split:
- DB operations → `$transaction` with SessionSummary creation
- In-memory cleanup → remain after the transaction

The planner should either:
(a) Extract a new `endSessionAndCreateSummary()` function, or
(b) Modify the `/summary` command to do the transaction directly and call a lightweight cleanup function.

### Anti-Patterns to Avoid

- **LLM call inside the transaction:** D-13 says the SessionSummary is created atomically. Compute strengths BEFORE entering the transaction. The transaction should only contain DB writes. Keep LLM I/O outside the transaction block.

- **Running strength analysis on every summary call without message caching:** Fetch messages once, pass to LLM once. Don't refetch after the LLM call.

- **Storing the full conversation text in SessionSummary:** The `strengths` field stores only the 3 strength strings, not the full conversation. The session `summary` (set by summarizer service) captures the conversation context. Don't duplicate.

- **Modifying `endSession()` for `/end` command:** The `/end` command (`commands/end.ts`) also calls `endSession()`. It should NOT create a SessionSummary (no summary data). Keep the existing behavior for `/end` — only the enhanced `/summary` path creates SessionSummary. Either add a parameter to `endSession()` or create a separate function.

- **Missing `sessionId` index on ReviewItem:** D-08 requires counting ReviewItems by sessionId. Without an index, this scan will be O(n) over the entire ReviewItem table. Add `@@index([sessionId])` in the schema.

- **Embed field overflow:** 3 existing fields + 3 new fields + summary text field = 7 fields total. Well within the 25-field limit. But the Strengths field value could exceed 1024 chars if strengths are verbose. Keep strength descriptions short (1-2 sentences each).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Strength analysis | Rating-based Easy tracking during session | LLM analysis at /summary time (D-01) | Rating-based tracking would require per-message Easy rating storage on messages and complex aggregation. LLM reads the conversation meaningfully. |
| Expansion counting | Add counter field to Session model | Count ReviewItems by sessionId (D-08) | A counter field would need atomic increment on every extraction — fragile with concurrent jobs. Count-after-the-fact is accurate and simple. |
| Queue health tracking | Persistent queue health tracking | Query ReviewItem due within 24h (D-10) | Queue health is a snapshot query. Persisting it would need refresh logic. The SessionSummary stores the snapshot value at end time. |
| Atomicity | Manual rollback logic | Prisma `$transaction` (array or interactive) | Prisma transactions handle rollback automatically on error. Hand-rolled error handling with manual compensation is error-prone. |

**Key insight:** This phase connects existing capabilities without introducing new infrastructure patterns. The LLM call for strength analysis follows the exact same pattern as the summarizer service (fetch messages, call LLM with prompt, parse output). The ReviewItem count queries are standard Prisma. The transaction pattern is standard Prisma `$transaction`.

## Common Pitfalls

### Pitfall 1: LLM Strength Analysis Timeout

**What goes wrong:** The strength analysis LLM call runs synchronously during the `/summary` command. If GPT-4o-mini is slow or the API is degraded, the user waits longer than expected.

**Why it happens:** gpt-4o-mini typically responds in ~1-2 seconds for simple analysis, but API rate limits or network issues can cause delays. The deferred reply window is 15 minutes, so this won't break the command — but it degrades UX.

**How to avoid:** Set a conservative `max_tokens` (500) and consider a reasonable timeout on the HTTP request. The analysis is simple (identify 3 strengths from a conversation), so it shouldn't need many tokens.

```typescript
const completion = await openai.chat.completions.create(
  {
    model: env.CONVERSATION_MODEL,
    messages: [...],
    temperature: 0.3,
    max_tokens: 500,
  },
  { timeout: 10_000 },  // 10s timeout
);
```

**Warning signs:** Users report that `/summary` takes "a long time" to respond.

### Pitfall 2: SessionSummary Created But Session Not Ended (or Vice Versa)

**What goes wrong:** If the database write fails after one operation completes, the session is ended but no SessionSummary is created (or summary is created but session remains active).

**Why it happens:** Writing the session update and SessionSummary create as separate operations without a transaction.

**How to avoid:** Always use Prisma `$transaction` (array form for independent operations) to ensure both succeed or both fail. Prisma 6 supports this pattern:

```typescript
await prisma.$transaction([
  prisma.session.update({ where: { id }, data: { status: "ended", endedAt: new Date() } }),
  prisma.sessionSummary.create({ data: { sessionId, strengths, ... } }),
]);
```

**Warning signs:** Orphaned SessionSummary records or sessions stuck in "active" status after summary.

### Pitfall 3: `/end` Command Also Creates SessionSummary (Shouldn't)

**What goes wrong:** If the enhanced `endSession()` is called from both `/summary` and `/end`, the `/end` command will attempt to create a SessionSummary without having computed strength/expansion/queue data.

**Why it happens:** Both commands share the same `endSession()` function.

**How to avoid:** Two options:
(a) Keep `endSession()` for `/end` (no SessionSummary). Create a separate `endSessionWithSummary()` for `/summary`.
(b) Add an optional `summaryData` parameter to `endSession()` — if provided, create SessionSummary.

The planner should decide. Option (a) is cleaner — no conditional branching in `endSession()`.

### Pitfall 4: Embed Field Value Exceeds 1024 Characters

**What goes wrong:** The Strengths field could exceed Discord's 1024-character limit per field value if strength descriptions are verbose.

**Why it happens:** Each strength is ~200-300 chars of explanation. Three strengths = ~600-900 chars. This fits within 1024, but if strengths are wordy it could overflow.

**How to avoid:** Keep each strength description to 1-2 sentences. If the total exceeds 1000 chars, truncate the last strength. The EmbedBuilder will throw if over the limit, so validate before building.

```typescript
const strengthsValue = summary.strengths
  .map((s, i) => `**${i+1}.** ${s}`)
  .join("\n");

if (strengthsValue.length > 1024) {
  // Truncate — keep first 2 strengths if 3 is too verbose
  // Or: shorten descriptions
}
```

**Warning signs:** EmbedBuilder throws `FIELD_VALUE_LENGTH` validation error.

### Pitfall 5: Race Condition — Extraction Job Completes After Session Ends

**What goes wrong:** A user runs `/summary` before all pending extraction jobs for that session have completed. The expansion count is lower than expected because some items weren't created yet.

**Why it happens:** Extract jobs are async (BullMQ background processing). They may still be queued when the user ends the session.

**How to avoid:**
- This is an acceptable tradeoff for v1. The count is "items extracted so far" at the time of summary.
- For a more accurate count in the future, the session could wait for pending extraction jobs (marker pattern) — but this adds complexity.
- Document this behavior: expansion count is a snapshot at summary time, not a guaranteed complete count.

**Warning signs:** N/A — expected behavior.

## Code Examples

### Strength Analysis Prompt (Recommended)

```markdown
<!-- Source: CONTEXT.md D-02, D-03 — derives from existing prompt patterns -->
<!-- File: src/prompts/conversation/strengths.md -->

Analyze the following {{targetLanguage}} conversation between a language learner and a native speaker tutor.

Your task: Identify the TOP 3 things the user did well in this conversation session.

Focus on specific vocabulary usage, grammar structures, or communication strategies that the user handled correctly and naturally. Be specific — mention exact words, phrases, or grammar patterns.

Output format — exactly 3 lines, each starting with "•":
• [Specific vocabulary/grammar]: [brief explanation of what the user did well]
• [Specific vocabulary/grammar]: [brief explanation]
• [Specific vocabulary/grammar]: [brief explanation]

Examples:
• Past tense (-ar verbs): Used "hablé", "trabajé", and "compré" with correct preterite conjugations throughout the conversation
• Question formation: Correctly formed "¿Qué piensas?" and "¿Cuándo fuiste?" with proper intonation markers
• Food vocabulary: Naturally used "desayuno", "almuerzo", and "cena" in context when describing daily routine

Keep each explanation to 1-2 sentences. Write in English. Return exactly 3 strengths.
```

### Enhanced Embed Builder

```typescript
// Source: discord.js v14 EmbedBuilder docs
// [CITED: discordjs.guide/popular-topics/embeds]
// [VERIFIED: npm registry — discord.js@14.26.x]

const embed = new EmbedBuilder()
  .setColor(0x3498db)
  .setTitle("📊 Session Summary")
  .addFields(
    // Existing fields — row 1 (3 inline fields)
    { name: "Messages", value: String(summary.messageCount), inline: true },
    { name: "Corrections", value: String(summary.correctionCount), inline: true },
    { name: "Duration", value: summary.duration, inline: true },
    // NEW: Strengths — full-width block (D-03 format)
    {
      name: "🏆 Strengths",
      value: summary.strengths
        .map((s, i) => `**${i + 1}.** ${s}`)
        .join("\n") || "None identified",
    },
    // NEW: Expansion + Queue — row 2 (2 inline fields)
    { name: "📖 New Items", value: `${summary.expansionCount} items extracted`, inline: true },
    { name: "📚 Queue", value: `${summary.queueHealth} due in 24h`, inline: true },
  )
  .setTimestamp();

// Existing LLM summary text (if available)
if (summary.summary) {
  embed.addFields({ name: "📝 Summary", value: summary.summary });
}
```

### Queue Health Query

```typescript
// Source: CONTEXT.md D-10 — queue health within 24h window
// [ASSUMED — standard Prisma date range query]

const now = new Date();
const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

const queueCount = await prisma.reviewItem.count({
  where: {
    userId: dbSession.userId,     // The user's internal DB id
    due: {
      gte: now,                   // Items already due
      lte: in24h,                 // Items due within 24 hours
    },
  },
});

// Display as: "📚 Queue: 5 due in 24h" (D-09)
```

### Prisma $transaction Pattern

```typescript
// Source: Prisma 6 docs — $transaction array API
// [CITED: prisma.io/docs/orm/prisma-client/queries/transactions]
// [VERIFIED: @prisma/client@6.19.x]

// Independent operations — use array form
// Both succeed or both fail atomically
await prisma.$transaction([
  prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "ended",
      endedAt: new Date(),
      messageCount: summary.messageCount,
      correctionCount: summary.correctionCount,
    },
  }),
  prisma.sessionSummary.create({
    data: {
      sessionId: sessionId,
      strengths: summary.strengths,           // string[] — Prisma serializes to JSON
      expandedCount: summary.expansionCount,
      queueHealth: summary.queueHealth,
      summary: summary.summary,
    },
  }),
]);
```

**Important:** The array form of `$transaction` works for independent operations (no dependency on each other's results). This is correct here — the session update and summary create don't depend on each other's output (the `sessionSummary.sessionId` is already known before the transaction).

## Runtime State Inventory

> This phase is a feature enhancement, not a rename/refactor/migration. No runtime state changes needed.

**Stored data:** No old-name references to update. New ReviewItem.sessionId field is optional — existing records remain valid with NULL. New SessionSummary model is additive.

**Live service config:** No configuration changes needed. Environment variables, Discord intent settings, and BullMQ configuration remain unchanged.

**OS-registered state:** No OS-level registrations affected.

**Secrets and env vars:** No new secrets or env var names introduced. D-02 reuses existing `CONVERSATION_MODEL`.

**Build artifacts:** `npx prisma generate` needed after schema change. No other build artifact changes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Session data only from memory (messageCount, correctionCount in Map) | Session data also persisted to PostgreSQL | Phase 2 | Phase 5 extends this pattern — SessionSummary persists post-session data that doesn't exist in-memory |
| `/summary` shows basic stats only | Enhanced summary with LLM strengths, expansion, queue | Phase 5 | Adds three data dimensions without breaking existing behavior |
| Extraction creates items without session tracking | Items tagged with sessionId (optional FK) | Phase 5 | Enables session-attributed expansion metrics. Existing items remain valid (NULL sessionId) |
| Session ends with single DB update | Session ends with atomic DB update + SessionSummary create | Phase 5 | Adds durability to session summary data |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prisma `$transaction` array form works for independent session.update + sessionSummary.create | Pattern 5 | LOW — Prisma 6 transaction docs confirm array form supports independent operations |
| A2 | The strength analysis call to gpt-4o-mini completes within 10s | Pitfall 1 | MEDIUM — If model is slow, user waits. Mitigation: timeout + graceful fallback. gpt-4o-mini is generally fast. |
| A3 | Discord embed field value limit is 1024 characters | Pitfall 4 | HIGH — If limit differs, embed builder throws. Confirmed in web search: Discord caps field values at 1024 characters. |
| A4 | The extraction job payload already contains sessionId (verified: yes, in `ExtractionJobPayloadSchema`) | Pattern 3 | LOW — Already confirmed in codebase at `src/types/extraction.ts` line 5 |
| A5 | `createItem()` can accept an optional sessionId parameter without breaking existing callers | Pattern 2 | LOW — Adding optional param to TypeScript function is backward-compatible |
| A6 | `prisma.reviewItem.count({ where: { sessionId } })` works without creating a relation in the schema | Pattern 4 | LOW — Must add `sessionId String?` and `session Session? @relation()` to ReviewItem model, plus index |
| A7 | SessionSummary strengths JSON field can store a string[] directly | D-12 | MEDIUM — Prisma's Json type accepts any serializable value. string[] is valid JSON. Should work. |

## Open Questions

1. **Should `endSession()` be refactored into two functions or accept a parameter?**
   - What we know: Both `/summary` and `/end` call `endSession()`.
   - What's unclear: `/summary` needs SessionSummary creation; `/end` does not.
   - Recommendation: **Separate function** `endSessionWithSummary(summaryData)` for `/summary`. Leave existing `endSession()` unchanged for `/end`. Cleaner than adding conditional params.

2. **How should the active session Map cleanup work with the new transaction?**
   - What we know: DB writes go in `$transaction`. In-memory cleanup (Map delete, thread archive) happens separately.
   - What's unclear: Should the in-memory cleanup happen before or after the transaction?
   - Recommendation: **After the transaction.** If the transaction fails, the session should still be in the in-memory Map so the user can retry. If in-memory cleanup happens before the transaction and the transaction fails, the session is lost in memory but active in DB.

3. **Should queue health use a new `getQueueHealth()` function or inline query?**
   - What we know: D-10 leaves this at agent's discretion.
   - Recommendation: **Inline query** in the enhanced `getSessionSummary()`. It's a single `prisma.reviewItem.count()` call — no abstraction needed. Adding a function to fsrs.ts would be over-engineering for a simple count query.

## Validation Architecture

> `workflow.nyquist_validation` is enabled. See `.planning/config.json`.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 |
| Config file | Inherits from vitest config (likely `vitest.config.ts` or inline in package.json) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUMM-01 | /summary terminates session + aggregates data | Integration (mocked) | `npx vitest run src/__tests__/commands/summary.test.ts` | ❌ Wave 0 |
| SUMM-02 | Embed displays top 3 strengths | Integration (mocked LLM) | `npx vitest run src/__tests__/commands/summary.test.ts` | ❌ Wave 0 |
| SUMM-03 | Expansion metrics = count ReviewItems by sessionId | Unit (service) | `npx vitest run src/__tests__/conversation.test.ts` | ❌ Wave 0 |
| SUMM-04 | Queue health = items due within 24h | Unit (service) | `npx vitest run src/__tests__/conversation.test.ts` | ❌ Wave 0 |
| SUMM-05 | SessionSummary persists to PostgreSQL | Integration (mocked Prisma) | `npx vitest run src/__tests__/commands/summary.test.ts` | ❌ Wave 0 |
| D-07 | Extraction sets sessionId at creation only | Unit (extraction service) | `npx vitest run src/__tests__/extraction.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose src/__tests__/commands/summary.test.ts src/__tests__/conversation.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/commands/summary.test.ts` — covers SUMM-01, SUMM-02, SUMM-05 (new test file)
- [ ] Extend `src/__tests__/conversation.test.ts` — covers SUMM-03, SUMM-04 (enhanced getSessionSummary)
- [ ] Extend `src/__tests__/extraction.test.ts` — covers D-07 (sessionId pass-through)
- [ ] Mock strength analysis LLM in summary tests (mock OpenAI response with 3 fake strengths)

## Security Domain

> `security_enforcement: true` in config.json. `asvs_level: 1`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Discord OAuth handles identity |
| V3 Session Management | Yes | Session state in Prisma + Map — no session tokens exposed |
| V4 Access Control | No | Single-user per session — no RBAC needed |
| V5 Input Validation | Yes | Zod schemas for extraction job payloads. LLM output parsed from `chat.completions.create()`, not from user input directly. |
| V6 Cryptography | No | No secrets stored at rest (SessionSummary is user-facing data) |

### Known Threat Patterns for {discord.js + Prisma}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM hallucination in strength analysis | Tampering (of perceived data) | Strengths are displayed as LLM-generated suggestions — no automated action is taken based on them. User reads and ignores if inaccurate. |
| Unauthorized session summary access | Information Disclosure | Conversation summary command checks `activeSessions` Map by `userId` from interaction. Session data is per-user — no cross-user access possible via Discord interaction pattern. |
| Prisma transaction rollback leaving inconsistent state | Denial of Service | If transaction fails after in-memory cleanup (Map delete + thread archive), the session is "lost" in-memory but remains active in DB. Mitigation: clean up in-memory AFTER the transaction commits, not before. |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/commands/summary.ts` — existing /summary command structure
- Codebase analysis: `src/services/conversation.ts` — getSessionSummary() and endSession() signatures
- Codebase analysis: `src/services/extraction.ts` — processExtractionJob() with sessionId in payload
- Codebase analysis: `src/services/fsrs.ts` — createItem(), getDueItems() signatures
- Codebase analysis: `prisma/schema.prisma` — existing model definitions
- Codebase analysis: `src/types/extraction.ts` — ExtractionJobPayload includes sessionId
- Codebase analysis: `src/events/messageCreate.ts` — extraction enqueue passes sessionId
- Codebase analysis: `src/prompts/conversation/system.md` and `extraction/system.md` — prompt patterns

### Secondary (MEDIUM confidence)
- [CITED: discordjs.guide/popular-topics/embeds] — embed field limits (name 256, value 1024, 25 fields max)
- [CITED: prisma.io/docs/orm/prisma-client/queries/transactions] — $transaction patterns
- [CITED: stackoverflow + Discord API docs] — inline field limit is 3 per row on desktop

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all existing verified dependencies
- Architecture: HIGH — all patterns derived from existing codebase analysis
- Pitfalls: MEDIUM — most derived from codebase patterns, some from general Prisma/LLM knowledge

**Research date:** 2026-07-21
**Valid until:** 2026-08-21 (30 days — stable stack, no fast-moving dependencies in this phase)
