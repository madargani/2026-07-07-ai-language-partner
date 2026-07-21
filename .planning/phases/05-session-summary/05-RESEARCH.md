# Phase 5: Session Summary — Research

**Researched:** 2026-07-21
**Domain:** Discord bot post-session analytics, LLM strength analysis, Prisma data persistence, queue health metrics
**Confidence:** HIGH

## Summary

Phase 5 enhances the existing `/summary` command to deliver structured post-session insights: top 3 LLM-derived strengths, vocabulary expansion metrics via ReviewItem.sessionId tracking, and queue health count. A new `SessionSummary` Prisma model persists results for historical access. The extraction pipeline (Phase 4) already has `sessionId` in its job payload but does not stamp it on ReviewItems — this is the primary integration gap. The FSRS service (`createItem()`) lacks an optional `sessionId` parameter. The existing `getDueItems()` function can be adapted, or a new `getQueueHealth()` helper added. Embed patterns follow established blue-color, inline-field conventions from Phases 2 and 4.

**Primary recommendation:** Add optional `sessionId` to `CreateItemInput`/`createItem()`, stamp it from the extraction payload, then build a `getQueueHealth()` function on the FSRS service for 24h-window queries. Create `SessionSummary` model with Prisma transaction wrapping the session end. Reuse `CONVERSATION_MODEL` (defaults to `gpt-4o` in config, but user decided `gpt-4o-mini` — see risk note) for on-the-fly strength analysis.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUMM-01 | /summary terminates session and aggregates session data | Existing flow in `endSession()` and `getSessionSummary()` in conversation.ts — enhance to include new fields |
| SUMM-02 | Embed displays top 3 strengths | LLM strength analysis via CONVERSATION_MODEL, on-the-fly at /summary time. Prompt pattern follows summarizer.ts |
| SUMM-03 | Embed displays expansion metrics | ReviewItem.sessionId FK tracks which items were created during a session. Count via `prisma.reviewItem.count({ where: { sessionId } })` |
| SUMM-04 | Embed displays queue health | Items due in next 24h. Query via new `getQueueHealth()` on FSRS service or inline `prisma.reviewItem.count()` |
| SUMM-05 | Summary persists to PostgreSQL | New SessionSummary Prisma model. Created atomically in Prisma $transaction with session status update |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Strength analysis LLM call | API / Backend | — | LLM call is server-side, no browser involvement. Uses existing OpenAI SDK |
| Expansion metrics query | Database / Storage | API / Backend | Count query against ReviewItem table. API orchestrates the query |
| Queue health query | Database / Storage | API / Backend | Count query against ReviewItem table with time-window filter |
| SessionSummary persistence | Database / Storage | API / Backend | New model and migration. Written atomically via Prisma transaction |
| Embed building and display | API / Backend | — | Discord embed is built server-side and sent via interaction.editReply |

## Standard Stack

### Core — All existing, no new packages
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | ^6.45.0 | LLM strength analysis | Already used for conversation and extraction. No new SDK needed |
| @prisma/client | ^6.19.0 | Database access | Existing ORM. SessionSummary model joins existing ReviewItem, Session, User |
| discord.js | ^14.26.0 | Embed building | Existing. EmbedBuilder already used in summary.ts, review.ts |
| ts-fsrs | ^5.4.1 | Queue health context | Existing FSRS service wraps ts-fsrs. No new algorithm work |

### Alternatives Considered — None needed
All capabilities use existing libraries. No new npm packages required for Phase 5.

**Installation:** None — Phase 5 adds no new dependencies.

## Package Legitimacy Audit

**No new packages installed in Phase 5.** All functionality uses existing dependencies (openai, @prisma/client, discord.js, ts-fsrs, zod). No audit required.

## Architecture Patterns

### Data Flow — Session Summary

```
User runs /summary
       │
       ▼
summary.ts execute()
       │
       ├─ 1. deferReply()
       │
       ├─ 2. getSessionSummary(userId) — enhanced
       │      ├── Fetch ActiveSession from in-memory map
       │      ├── Compute duration from Session.createdAt
       │      └── [NEW] Compute on-the-fly:
       │            ├── LLM strength analysis: analyze conversation messages → 3 strengths
       │            ├── Expansion count: reviewItem.count({ where: { sessionId } })
       │            └── Queue health: reviewItem.count({ where: { userId, due: { gte: now, lte: +24h } } })
       │
       ├─ 3. endSession(userId) — enhanced
       │      ├── Update Session status → "ended", set endedAt
       │      ├── Archive Discord thread
       │      └── [NEW] Prisma $transaction:
       │            ├── session.update({ status: "ended", endedAt, messageCount, correctionCount })
       │            └── sessionSummary.create({ sessionId, strengths, expandedCount, queueHealth, summary })
       │
       ├─ 4. Build embed with all fields
       │      ├── Messages, Corrections, Duration (existing)
       │      ├── Strengths (3 inline fields), Expansion, Queue Health (new)
       │      └── LLM summary text (existing)
       │
       └─ 5. interaction.editReply({ embeds: [embed] })
```

### Recommended Project Structure — No structural changes needed

All integration points are within existing files. No new directories needed.

### Pattern 1: LLM Strength Analysis (modeled on summarizer.ts)

**What:** Use OpenAI with the existing `CONVERSATION_MODEL` to analyze conversation messages and extract 3 specific vocabulary/grammar strengths.

**When to use:** Once at `/summary` time, after fetching messages for the session.

**How the summarizer.ts pattern works:**
1. Load system prompt from `prompts/conversation/strengths.md`
2. Fetch all messages for the session from Prisma
3. Format messages as `"role: content"` lines
4. Call `openai.chat.completions.create()` with the prompt
5. Parse structured output

**Recommended strengths prompt strategy:**
```typescript
// Strengths extraction using existing summarizer pattern
const strengthsPrompt = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "strengths.md"),
  "utf-8",
);

const messages = await prisma.message.findMany({
  where: { sessionId },
  orderBy: { createdAt: "asc" },
});

const conversationText = messages
  .map((m) => `${m.role}: ${m.content}`)
  .join("\n");

const completion = await openai.chat.completions.create({
  model: env.CONVERSATION_MODEL,
  messages: [
    { role: "system", content: strengthsPrompt },
    { role: "user", content: conversationText },
  ],
  response_format: { type: "json_object" },
  max_tokens: 500,
});

const strengths = JSON.parse(completion.choices[0]?.message?.content ?? "[]");
// Expected output format per D-03:
// [{ "term": "Preterite tense", "explanation": "used 'comí' and 'bebiste' correctly" }]
```

### Pattern 2: ReviewItem.sessionId Stamping

**What:** Pass optional `sessionId` through `createItem()` and stamp it on creation.

**Extraction payload already has `sessionId`** — verified in `src/types/extraction.ts`:
```typescript
// Already exists — no change needed to the job payload
export const ExtractionJobPayloadSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),   // ← ALREADY present
  messageContent: z.string().min(1).max(2000),
  targetLanguage: z.string().min(1),
  nativeLanguage: z.string().min(1),
  recentContext: z.string().max(5000),
});
```

**Changes needed to `src/services/fsrs.ts`:**
```typescript
// Extend CreateItemInput:
export interface CreateItemInput {
  userId: string;
  source: string;
  type: ItemType;
  language: string;
  sessionId?: string;  // ← NEW optional field
}

// Pass through to prisma.reviewItem.create():
return prisma.reviewItem.create({
  data: {
    userId: input.userId,
    source: input.source,
    type: input.type,
    language: input.language,
    sessionId: input.sessionId,  // ← NEW: passes through or undefined
    stability: card.stability,
    // ... rest unchanged
  },
});
```

**Changes needed to `src/services/extraction.ts`:**
```typescript
// Inside processExtractionJob(), in the createItem call:
await createItem({
  userId: data.userId,
  source: item.source,
  type: item.type,
  language: data.targetLanguage,
  sessionId: data.sessionId,  // ← NEW: stamp from job payload
});
```

### Pattern 3: Queue Health Query

**What:** Count ReviewItems due within the next 24-hour window for a user.

**Two approaches (agent's discretion):**

**Option A — New service function on fsrs.ts (recommended):**
```typescript
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
```

**Option B — Inline query in summary command.** Simpler but duplicates query logic. Option A keeps query responsibility in the FSRS service.

**Recommendation:** Option A. The FSRS service already owns `getDueItems()`. A `getQueueHealth()` function is a natural companion — discoverable, testable, follows the established pattern.

### Pattern 4: SessionSummary Prisma Model and Transaction

**What:** Create a SessionSummary model with 1:1 relation to Session. Write atomically with session end.

**Prisma model:**
```prisma
model SessionSummary {
  id            String   @id @default(uuid())
  sessionId     String   @unique
  session       Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  strengths     Json?    // JSON array of { term: string, explanation: string }[]
  expandedCount Int
  queueHealth   Int
  summary       String?  // Carried forward from Session.summary, or re-run LLM
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([sessionId])
}
```

**Transaction pattern in `endSession()`:**
```typescript
// In src/services/conversation.ts, enhanced endSession():
const [updatedSession] = await prisma.$transaction([
  prisma.session.update({
    where: { id: session.id },
    data: {
      status: "ended",
      endedAt: new Date(),
      messageCount: session.messageCount,
      correctionCount: session.correctionCount,
    },
  }),
  prisma.sessionSummary.create({
    data: {
      sessionId: session.id,
      strengths: strengthsJson,  // from LLM analysis
      expandedCount,              // from count query
      queueHealth,                // from getQueueHealth()
      summary: dbSession.summary ?? null,
    },
  }),
]);
```

**Why `$transaction`:** Per D-13, SessionSummary must be created atomically with the session end update. If the SessionSummary write fails, the session should not appear ended without its summary record. Prisma `$transaction` ensures both writes succeed or both roll back.

### Anti-Patterns to Avoid

- **Modifying `getSummary()` return type without backward compatibility:** The existing `getSessionSummary()` returns `{ messageCount, correctionCount, summary, duration }`. The planner could either add new fields to this return type or create a parallel function. **Recommendation:** Extend the existing return type with `strengths`, `expandedCount`, `queueHealth` fields — fewer changes, single code path.

- **Stamping `sessionId` on dedup skip paths:** D-07 is explicit: sessionId is only set at creation time. The dedup logic (`findFirst` on userId+source+type) skips creation for duplicates — do NOT add sessionId overwrite logic in the skip branch.

- **Using `openai.chat.completions.create()` without `response_format` for JSON output:** The strength analysis prompt returns structured JSON. Always use `response_format: { type: "json_object" }` or the `parse()` method (extraction.ts pattern) to ensure parseable output.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM strength analysis | Custom rule-based analysis of message text | OpenAI SDK with structured prompt | Rule-based analysis is brittle across languages. LLM naturally understands vocabulary/grammar strengths |
| FSRS scheduling | Manual due-date math | ts-fsrs library | Already in use. `getDueItems()` just needs a time-window adaptation |
| Discord embed pagination | Custom split logic for >25 fields | Single embed (current design fits under limit) | Summary has ~6 fields total. Below the 25-field limit. No pagination needed |

**Key insight:** Phase 5 builds entirely on existing infrastructure. No new library decisions — the challenge is integration plumbing (sessionId propagation, transaction boundaries).

## Common Pitfalls

### Pitfall 1: Forgetting to Add `sessionId` to Prisma Schema Before Extracting
**What goes wrong:** The extraction worker stamps `sessionId` but the Prisma model doesn't have the field yet → runtime error on createItem().
**Why it happens:** Schema migration and code changes get out of order.
**How to avoid:** Run `prisma migrate dev --name add_session_id_to_review_items` BEFORE any code that writes sessionId. Generate migration first, then add to `createItem()` calls.
**Warning signs:** Prisma validation error: `Unknown field 'sessionId' on ReviewItem`.

### Pitfall 2: LLM JSON Parsing Failure on Strength Analysis
**What goes wrong:** The LLM returns unparseable JSON (markdown-wrapped, extra keys, or empty content) → JSON.parse throws.
**Why it happens:** Without `response_format: { type: "json_object" }`, GPT-4o-mini may return natural language wrapping JSON.
**How to avoid:** Use `response_format: { type: "json_object" }` on the OpenAI call. Wrap parsing in try/catch with a fallback message like "Strengths analysis unavailable."
**Warning signs:** JSON.parse(SyntaxError) in production logs.

### Pitfall 3: Concurrent Session Summary Calls
**What goes wrong:** User runs `/summary` twice rapidly from different Discord clients. Both calls find the same ActiveSession and try to end it.
**Why it happens:** ActiveSession is stored in a Map — no locking mechanism. Two concurrent `endSession()` calls both delete from the Map, but both find the entry initially.
**How to avoid:** Check session status before writing the final update. Add `where: { id, status: "active" }` to the session update so only the first call succeeds. The second call updates 0 rows and can respond "Session already ended."
**Warning signs:** SessionSummary created twice for the same session (mitigated by `@unique` on sessionId).

### Pitfall 4: CONVERSATION_MODEL Default Mismatch
**What goes wrong:** D-02 says "Use the existing CONVERSATION_MODEL (gpt-4o-mini)" but the Zod config schema defaults `CONVERSATION_MODEL` to `"gpt-4o"` (line 13 of config.ts). This inconsistency means strength analysis may use a different model than expected unless explicitly configured.
**How to avoid:** Either (a) explicitly set `CONVERSATION_MODEL=gpt-4o-mini` in the environment, or (b) hardcode `"gpt-4o-mini"` for strength analysis as done in `summarizer.ts` (which hardcodes `model: "gpt-4o-mini"`). **Recommendation:** Follow the summarizer.ts pattern and hardcode the model or use a dedicated env var if cost matters. Flag this inconsistency to the user during discuss-phase.
**Warning signs:** Unexpected model costs or slower response times on strength analysis.

### Pitfall 5: SessionSummary Creation After Thread Archive
**What goes wrong:** The session thread is archived, then the SessionSummary write fails (DB connection issue). The session is permanently ended but the summary is lost.
**Why it happens:** `session.thread.setArchived(true)` happens inside `endSession()`, before the SessionSummary transaction.
**How to avoid:** Run the Prisma transaction FIRST, then archive the thread. If thread archiving fails, the summary is still persisted. This is the correct ordering — critical data before cosmetic cleanup.

## Code Examples

### Enhanced `getSessionSummary()` Return Type

```typescript
// Extended return type for getSessionSummary
interface SessionSummaryData {
  messageCount: number;
  correctionCount: number;
  summary: string;
  duration: string;
  // New fields added by Phase 5:
  strengths: Array<{ term: string; explanation: string }>;
  expandedCount: number;
  queueHealth: number;
  sessionId: string;
}
```

### Queue Health — Recommended FSRS Service Addition

```typescript
// Source: research pattern analysis of existing getDueItems() and Prisma findMany
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

// For the existing getDueItems(), add an optional time-window parameter:
export async function getDueItems(
  userId: string,
  options?: { after?: Date; before?: Date },
) {
  return prisma.reviewItem.findMany({
    where: {
      userId,
      due: {
        lte: options?.before ?? new Date(),
        ...(options?.after ? { gte: options.after } : {}),
      },
    },
    orderBy: { due: "asc" },
  });
}
```

### Expansion Metrics Count

```typescript
// Source: Prisma count query pattern (existing throughout codebase)
const expandedCount = await prisma.reviewItem.count({
  where: { sessionId },
});
```

### Enhanced Summary Embed

```typescript
// Source: existing summary.ts embed pattern (summary.ts:28-44) + review.ts embed pattern (review.ts:39-46)
const embed = new EmbedBuilder()
  .setColor(0x3498db)
  .setTitle("📊 Session Summary")
  .addFields(
    // Existing fields
    { name: "Messages", value: String(summary.messageCount), inline: true },
    { name: "Corrections", value: String(summary.correctionCount), inline: true },
    { name: "Duration", value: summary.duration, inline: true },

    // New fields — empty line separator for visual grouping
    { name: "\u200B", value: "\u200B", inline: false },

    // Strengths (top 3)
    { name: "🏆 Top Strengths", value: summary.strengths.map((s, i) =>
      `**${i + 1}. ${s.term}** — ${s.explanation}`
    ).join("\n") || "Session too short to analyze.", inline: false },

    // Expansion metrics
    { name: "📈 New Items", value: `${summary.expandedCount} extracted`, inline: true },

    // Queue health
    { name: "📚 Queue", value: `${summary.queueHealth} due in 24h`, inline: true },
  )
  .setTimestamp();

if (summary.summary) {
  embed.addFields({ name: "Summary", value: summary.summary });
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.10 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose src/__tests__/commands/summary.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUMM-01 | /summary terminates session | integration | `npx vitest run src/__tests__/commands/summary.test.ts -t "terminates" -x` | ❌ Wave 0 |
| SUMM-02 | Embed shows top 3 strengths | integration | `npx vitest run src/__tests__/commands/summary.test.ts -t "strengths" -x` | ❌ Wave 0 |
| SUMM-03 | Embed shows expansion count | integration | `npx vitest run src/__tests__/commands/summary.test.ts -t "expansion" -x` | ❌ Wave 0 |
| SUMM-04 | Embed shows queue health | integration | `npx vitest run src/__tests__/commands/summary.test.ts -t "queue" -x` | ❌ Wave 0 |
| SUMM-05 | Summary persists to PostgreSQL | integration | `npx vitest run src/__tests__/commands/summary.test.ts -t "persists" -x` | ❌ Wave 0 |
| — | SessionSummary model 1:1 relation | unit | `npx vitest run src/__tests__/services/summary-service.test.ts -x` | ❌ Wave 0 |
| — | Queue health 24h window query | unit | `npx vitest run src/__tests__/services/summary-service.test.ts -t "queue" -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/__tests__/commands/summary.test.ts --reporter=verbose`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/commands/summary.test.ts` — covers SUMM-01 through SUMM-05
- [ ] `src/__tests__/services/summary-service.test.ts` — covers SessionSummary creation, queue health query, expansion count query
- [ ] Existing `src/__tests__/setup.ts` — verify mockPrisma already has `reviewItem.count` mock and `sessionSummary` methods (probably needs update to add count and sessionSummary mocks)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Discord OAuth handles auth — no password store |
| V3 Session Management | no | Sessions are per-user Discord threads, no cookie/token |
| V4 Access Control | no | Single-user bot, no role-based access |
| V5 Input Validation | yes | Zod schema for extraction payload. LLM strength output parsed with try/catch + fallback |
| V6 Cryptography | no | No encryption needed. Data stored in PostgreSQL without PII beyond Discord user IDs |

### Known Threat Patterns for Express+Discord.js Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| LLM prompt injection via message content | Tampering | System prompt explicitly constrains extraction output to `detectedItems[]`. Strength analysis runs on conversation messages already in DB — same content the conversation model already processed |
| Race condition on session end | Denial of Service | Use `where: { id, status: "active" }` on session update. Unique constraint on SessionSummary.sessionId prevents duplicates |
| Unparseable LLM JSON output | — | Always use `response_format` parameter + try/catch with fallback display text |

## Implementation Guidance

### Proposed Implementation Order

1. **Prisma schema changes** (migration first):
   - Add optional `sessionId` (String?) to ReviewItem model with FK → Session
   - Create SessionSummary model with 1:1 relation to Session
   - Run `prisma migrate dev --name session_summary`

2. **FSRS service changes:**
   - Add optional `sessionId` to `CreateItemInput` and pass through to `createItem()`
   - Add `getQueueHealth(userId)` function

3. **Extraction worker change:**
   - Pass `data.sessionId` to `createItem()` call in `processExtractionJob()`

4. **Conversation service changes:**
   - Extend `getSessionSummary()` return type with new fields
   - Add strength analysis LLM call
   - Add expansion count query
   - Add queue health query
   - Enhance `endSession()` to create SessionSummary in `$transaction`

5. **Summary command change:**
   - Enhance embed with new fields in the order: Messages, Corrections, Duration, (separator), Strengths, New Items, Queue Health, (separator), Summary text

6. **Test changes:**
   - Update test setup to include `reviewItem.count` mock and `sessionSummary` mock
   - Add summary command tests
   - Add summary service tests

### Key Files Modified
| File | Change Type | What Changes |
|------|-------------|-------------|
| `prisma/schema.prisma` | Add fields + model | Add `sessionId` to ReviewItem. Add `SessionSummary` model |
| `src/services/fsrs.ts` | Extend API | Add `sessionId` to `CreateItemInput`, add `getQueueHealth()` |
| `src/services/conversation.ts` | Enhance functions | Extend `getSessionSummary()` return, add strength LLM call, add `$transaction` to `endSession()` |
| `src/services/extraction.ts` | Pass-through | Pass `data.sessionId` to `createItem()` |
| `src/commands/summary.ts` | Enhance embed | Add new fields to embed |

### What NOT to Change
- **Do NOT** modify `src/lib/config.ts` — no new env vars needed
- **Do NOT** modify `src/lib/prisma.ts` — singleton pattern unchanged
- **Do NOT** modify `src/types/extraction.ts` — `sessionId` already in payload
- **Do NOT** modify `src/types/session.ts` — ActiveSession interface stays the same
- **Do NOT** modify `src/lib/queue.ts` — extraction queue unchanged
- **Do NOT** modify `src/events/messageCreate.ts` — extraction enqueue unchanged

## Potential Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM strength analysis timeout during /summary | Low | Medium — user sees incomplete embed | Set timeout on OpenAI call (15s as in extraction.ts). Fallback: show "Strengths analysis unavailable" |
| SessionSummary creation fails after session update | Low | High — ended session without summary | Use `$transaction` for atomicity. Update session status AFTER the transaction inside the same transaction |
| Extraction job arrives after session ended | Low | Low — sessionId no longer matches active session | sessionId is just a FK reference. Still valid as a data point even if the session is ended. No integrity issue |
| CONVERSATION_MODEL mismatch (gpt-4o vs gpt-4o-mini) | Medium | Medium — higher costs if gpt-4o used by default | Hardcode model for strength analysis or set CONVERSATION_MODEL=gpt-4o-mini in env. Flag to user |
| Multiple ReviewItems with same sessionId from concurrent sessions | Low | Low — concurrent sessions per user not supported (single ActiveSession per user in the Map) | Architecture prevents this: only one active session per user |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Extraction job payload `sessionId` is the correct UUID and matches Session.id at enqueue time | ReviewItem.sessionId Integration | Already verified: `src/events/messageCreate.ts` passes `session.id` from the ActiveSession map, which is the same UUID created in `createSession()`. LOW risk. |
| A2 | The `CONVERSATION_MODEL` env var defaults to `gpt-4o` in config.ts, but D-02 treats it as `gpt-4o-mini` | LLM Strength Analysis | MEDIUM risk — if the env var is not explicitly set, strength analysis uses `gpt-4o` instead of `gpt-4o-mini`. Mitigation: hardcode model or update `.env.example`. Flag to user in discuss-phase. |
| A3 | Prisma `$transaction` with array of promises works with Prisma 6.x | SessionSummary Model | Already verified [CITED: Prisma docs — `$transaction` accepts array of Prisma promises]. LOW risk. |

## Open Questions (RESOLVED)

1. **Strength analysis prompt location** — RESOLVED: Create `prompts/conversation/strengths.md` as a template file. Follows the established pattern from summarizer.ts.
   - What we know: Existing prompts live in `prompts/conversation/` (summarize.md exists). The strength analysis prompt should follow the same pattern.
   - What's unclear: Whether to create `prompts/conversation/strengths.md` or inline the prompt in conversation.ts (like the greeting prompt).
   - **Recommendation:** Create `prompts/conversation/strengths.md` as a template file. Follows the established pattern from summarizer.ts.

2. **CONVERSATION_MODEL vs hardcoded gpt-4o-mini** — RESOLVED: Hardcode "gpt-4o-mini" for strength analysis (following summarizer.ts pattern). Flag model config inconsistency to user.
   - What we know: D-02 says use CONVERSATION_MODEL (gpt-4o-mini). Config defaults CONVERSATION_MODEL to "gpt-4o". summarizer.ts hardcodes "gpt-4o-mini".
   - What's unclear: Which resolution to follow.
   - **Recommendation:** Follow summarizer.ts pattern — hardcode "gpt-4o-mini" for the strength analysis if the concern is cost. Or add an explicit `STRENGTHS_MODEL` env var. Present this choice to the planner.

3. **SessionSummary.summary field — carry forward or regenerate?** — RESOLVED: Carry forward existing `dbSession.summary` — zero additional LLM cost.
   - What we know: D-12 says "carry forward existing LLM summary." Session model already has a `summary` field populated by the summarizer.
   - What's unclear: Whether to store the Session's existing summary text or run a new LLM call for a comprehensive summary.
   - **Recommendation:** Carry forward `dbSession.summary` — it's already stored and cost-free. No additional LLM call needed.

4. **Test mock for `reviewItem.count` and `sessionSummary`** — RESOLVED: Add `count: vi.fn().mockResolvedValue(0)` to `reviewItem` mock, add `sessionSummary` block with create/findUnique/findMany, add `$transaction` mock.
   - What we know: `src/__tests__/setup.ts` has a `mockPrisma` with `reviewItem` methods (create, findUnique, findFirst, findMany, update) but NOT `count`. No `sessionSummary` mock exists.
   - What's unclear: Whether to add `count` to existing reviewItem mock or import the type as done.
   - **Recommendation:** Add `count: vi.fn().mockResolvedValue(0)` to the `reviewItem` mock in `setup.ts`. Add a `sessionSummary` block with `create`, `findUnique`, `findMany` methods.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | 26.0.0 | — |
| npm | Package mgmt | ✓ | 11.12.1 | — |
| Docker | Containerization | ✓ (assumed) | — | — |
| PostgreSQL | Database | — (container) | — | Part of Docker Compose |
| Redis | Queue backend | — (container) | — | Part of Docker Compose |

**Missing dependencies with no fallback:** None — all dependencies are managed via Docker Compose.

**Missing dependencies with fallback:** None needed — runtime tools verified.

## Sources

### Primary (HIGH confidence)
- Phase 5 CONTEXT.md — locked decisions D-01 through D-13
- Phase 4 CONTEXT.md — extraction pipeline design, job payload with sessionId
- Phase 3 CONTEXT.md — FSRS service API (createItem, getDueItems)
- Phase 2 CONTEXT.md — Session model, embed patterns, conversation patterns
- `prisma/schema.prisma` — Current schema verified
- `src/services/fsrs.ts` — createItem(), getDueItems() implementations verified
- `src/services/extraction.ts` — processExtractionJob() verified (missing sessionId pass-through)
- `src/services/conversation.ts` — getSessionSummary(), endSession() verified
- `src/services/summarizer.ts` — LLM prompt + call pattern for strength analysis
- `src/commands/summary.ts` — Embed pattern verified
- `src/commands/review.ts` — Embed pattern, button flow verified
- `src/events/messageCreate.ts` — enqueueExtraction() verified (sessionId present in payload)
- `src/types/extraction.ts` — ExtractionJobPayload schema verified (sessionId field present)
- `src/lib/config.ts` — CONVERSATION_MODEL default verified ("gpt-4o")
- `src/__tests__/setup.ts` — Mock structure verified
- `vitest.config.ts` — Test config verified

### Secondary (MEDIUM confidence)
- D-02 model designation (calls gpt-4o-mini "CONVERSATION_MODEL" but config defaults to gpt-4o) — flagged as inconsistency
- SessionSummary model field naming — follow existing Prisma conventions (camelCase)

### Tertiary (LOW confidence)
- None — all claims either verified from source code or flagged as `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all verified from existing code
- Architecture: HIGH — patterns validated against existing code (conversation.ts, summarizer.ts, extraction.ts, fsrs.ts)
- Pitfalls: HIGH — derived from actual code analysis and known Prisma/discord.js patterns
- Environment: MEDIUM — Docker/Docker Compose assumed present but not verified in this session

**Research date:** 2026-07-21
**Valid until:** 2026-08-21 (stable stack — no dependency changes expected)
