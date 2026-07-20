# Phase 5: Session Summary - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing `/summary` command to deliver actionable post-session insights — top strengths, vocabulary expansion metrics, and review queue health. The existing command (Phase 2) shows basic stats (message count, corrections, duration, LLM summary text). This phase adds structured data: strengths derived via LLM analysis of the conversation, expansion metrics from newly extracted items during the session, and queue health showing items due for review. A new SessionSummary Prisma model persists the data for historical tracking.

**Requirements (from REQUIREMENTS.md):** SUMM-01 through SUMM-05

**Success Criteria (from ROADMAP.md):**
1. User runs /summary and the session terminates with a summary embed displayed in Discord
2. Summary embed shows top 3 strengths — items rated Easy or that the user handled well during the session
3. Summary embed shows expansion metrics — count of new items auto-extracted during the session
4. Summary embed shows queue health — number of items due for review in the next 24 hours
5. Summary persists to PostgreSQL so user can retrieve historical session data later

</domain>

<decisions>
## Implementation Decisions

### Strengths Derivation
- **D-01:** Use LLM analysis of conversation to determine top 3 strengths — NOT ReviewItem rating tracking or session-based rating queries
- **D-02:** Use the existing `CONVERSATION_MODEL` (gpt-4o-mini) for strength analysis. No new LLM provider or model key needed
- **D-03:** Output format: specific vocabulary/grammar terms the user handled well, with brief explanations (e.g., "You handled past tense conjugations for -ar verbs correctly throughout")
- **D-04:** Strength analysis runs ONCE at `/summary` time, not progressively during conversation
- **D-05:** Strengths are computed on-the-fly at display time — NOT persisted to the database. No new fields or migrations needed for strengths

### Expansion Metrics Tracking
- **D-06:** Add an optional nullable `sessionId` FK field on the `ReviewItem` Prisma model (FK → Session). This tracks which session an item was extracted during
- **D-07:** The extraction worker (`src/services/extraction.ts`) sets `sessionId` at creation time only. The existing dedup logic (findFirst on userId+source+type) skips creation for duplicates — no sessionId is overwritten
- **D-08:** Summary query counts ReviewItems where `sessionId` matches the current session. This handles concurrent sessions correctly

### Queue Health Display
- **D-09:** Display as raw count: `📚 Queue: X due in 24h` — no qualitative labels, no type breakdown
- **D-10:** Query uses `updatedAt` within the session time window or a new FSRS service function for queue health within 24h

### Historical Persistence (SUMM-05)
- **D-11:** Create a new `SessionSummary` Prisma model with 1:1 relation to Session (unique FK)
- **D-12:** SessionSummary fields: `sessionId` (FK, unique), `strengths` (JSON), `expandedCount` (Int), `queueHealth` (Int), plus the existing LLM `summary` text carried forward from Session. Timestamps (createdAt, updatedAt)
- **D-13:** SessionSummary is created atomically when `/summary` terminates the session — written alongside the Session status update

### the agent's Discretion
- Exact SessionSummary field ordering, defaults, and column attributes — planner follows Prisma conventions
- LLM prompt for strength analysis — researcher recommends based on the existing conversation and extraction prompt patterns
- SessionSummary creation timing — whether to use a Prisma transaction with the session end update
- Embed layout for the enhanced summary — how to arrange the 3 new fields alongside existing ones (embeds have 25-field limit, so order matters)
- FSRS service: whether to add a `getQueueHealth(userId)` function or query directly in the summary command

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/PROJECT.md` — Project vision, constraints, key decisions (bot persona, correction-light approach)
- `.planning/REQUIREMENTS.md` — SUMM-01 through SUMM-05

### Phase Definition
- `.planning/ROADMAP.md` §"Phase 5: Session Summary" — Goal, success criteria, requirements

### Technology Stack
- `AGENTS.md` — Stack decisions, version choices, what NOT to use

### Prior Phase Contracts
- `.planning/phases/04-extraction-review/04-CONTEXT.md` — Extraction pipeline design (job payload carries sessionId, dedup logic, ReviewItem creation)
- `.planning/phases/03-fsrs-spaced-repetition-bank/03-CONTEXT.md` — FSRS service (getDueItems), ReviewItem model
- `.planning/phases/02-ai-conversation/02-CONTEXT.md` — Conversation flow, Session model, existing /summary implementation

### Existing Code
- `src/commands/summary.ts` — Existing `/summary` command to be enhanced (embed, getSessionSummary, endSession)
- `src/services/conversation.ts` — `getSessionSummary()` and `endSession()` — need extension for new data
- `src/services/extraction.ts` — Extraction worker with dedup — needs to store sessionId on creation
- `src/services/fsrs.ts` — FSRS service, `getDueItems()` for queue health reference
- `prisma/schema.prisma` — Existing models (User, Session, Message, ReviewItem) — add ReviewItem.sessionId and SessionSummary

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Existing `/summary` command** (`src/commands/summary.ts`) — Already handles deferReply, embed building, endSession, getSessionSummary. Will be enhanced rather than replaced
- **EmbedBuilder pattern** — Established in summary.ts, review.ts, and conversation.ts. Blue color (0x3498db), timestamp, inline fields
- **FSRS service** (`src/services/fsrs.ts`) — `getDueItems()` can be adapted for queue health (add optional 24h window filter)
- **Extraction worker** (`src/services/extraction.ts`) — Already takes `ExtractionJobPayload` which includes `sessionId`. Job payload already has sessionId available for stamping

### Established Patterns
- **Command-per-file:** Each command in `src/commands/`. Enhancement to summary.ts follows existing patterns
- **deferReply() first:** All commands call deferReply() as first async operation. Already in place
- **Service modules:** `src/services/conversation.ts` shows module pattern. FSRS service is separate module
- **Prisma models:** Schema-first approach. SessionSummary follows same conventions as existing models
- **Graceful shutdown** (`src/index.ts`) — No changes needed; all data is database-persisted

### Integration Points
- **`prisma/schema.prisma`** — Add `sessionId` field (optional FK → Session) to ReviewItem. Add new SessionSummary model
- **`src/services/extraction.ts`** — Extraction worker needs to pass `sessionId` from job payload to `createItem()`
- **`src/services/fsrs.ts`** — `createItem()` needs optional `sessionId` parameter. Optional: add `getQueueHealth()` function
- **`src/commands/summary.ts`** — Enhanced embed with strengths, expansion metrics, queue health fields
- **`src/services/conversation.ts`** — `getSessionSummary()` extended with new data. `endSession()` creates SessionSummary record

</code_context>

<specifics>
## Specific Ideas

- Strengths prompt: analyze the conversation messages and extract 3 specific areas where the user demonstrated good understanding. Output as specific terms with explanations (e.g., "Preterite tense: used 'comí' and 'bebiste' correctly").
- Queue health query: `prisma.reviewItem.findMany({ where: { userId, due: { gte: now, lte: add24h } } })` for count.
- Summary embed order: existing fields (Messages, Corrections, Duration) then new fields (Strengths, Expansion, Queue Health) then the LLM summary text.
- SessionSummary creation: wrap in a Prisma `$transaction` with the session status update for atomicity.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-Session Summary*
*Context gathered: 2026-07-21*
