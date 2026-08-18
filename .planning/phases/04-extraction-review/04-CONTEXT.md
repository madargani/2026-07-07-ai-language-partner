# Phase 4: Extraction & Review - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a background extraction pipeline that converts conversation messages into FSRS cards via low-tier LLM + BullMQ/Redis, plus a structured `/review` command with FSRS rating. Extraction fires after the conversation response completes — user messages are enqueued to a BullMQ job queue, processed by GPT-4o-mini, and detected items are persisted via the existing FSRS service. The review flow presents due cards with structured prompts and rating buttons.

**Requirements (from REQUIREMENTS.md):** EXTR-01 through EXTR-06, REVW-01 through REVW-05

**Success Criteria (from ROADMAP.md):**
1. New FSRS cards are created automatically from conversation messages via a background low-tier LLM extraction pipeline (BullMQ/Redis)
2. Code-switching is detected: when the user types a native-language term in target-language chat, it is auto-extracted as a new FSRS item
3. User can run /review and see due cards with three prompt types (use-in-sentence, fill-in-blank, native-translation)
4. User can rate each card on the FSRS scale (Again=0, Hard=1, Good=2, Easy=3) and the next review date updates immediately
5. Review flow continues presenting cards until the queue is empty or the user exits via button

</domain>

<decisions>
## Implementation Decisions

### Extraction LLM & Model
- **D-01:** Use OpenAI `gpt-4o-mini` (the `EXTRACTION_MODEL` env var) for the extraction pipeline. No new LLM provider SDK — the existing OpenAI SDK v6 handles both conversation and extraction.

### Extraction Trigger & Timing
- **D-02:** Extraction fires **after** the conversation response completes. `handleConversationMessage` returns, then the user's message is enqueued to BullMQ for background extraction. No concurrent LLM calls alongside conversation — post-response enqueue simplifies error handling and avoids delaying the user's reply.

### BullMQ Job Architecture
- **D-03:** Single BullMQ queue named `"extraction"` with concurrency set to `1`
- **D-04:** Job payload includes: `userId`, `sessionId`, `messageContent`, `targetLanguage`, `nativeLanguage`, `recentContext` (last 2-3 messages for context). Worker has everything needed without extra DB queries.
- **D-05:** Retry: 3 attempts with exponential backoff (1s, 5s, 25s). Failed jobs route to a dead-letter queue for manual inspection.

### Extraction Zod Schema
- **D-06:** Structured output shape: `{ detectedItems: { source: string, type: "vocabulary" | "grammar" }[], typosIgnored: string[] }`
- **D-07:** Each detected item carries only `source` + `type` — no contextSnippet, confidence score, or suggested translation. Matches the existing ReviewItem model which stores `source` only.

### Semantic Filtering (EXTR-03)
- **D-08:** Mechanical typos (user knows the word, mistyped) → `typosIgnored` array. Cognitive mistakes (wrong word, incorrect grammar) → `detectedItems` for practice. Distinction is LLM-prompt driven — no post-processing logic.

### Code-Switching Detection (EXTR-04)
- **D-09:** When a native-language term appears in target-language chat, the extracted ReviewItem stores the **target-language equivalent** as `source`. The LLM infers the intended target-language term using both `nativeLanguage` and `targetLanguage` from the prompt.
- **D-10:** Extraction prompt explicitly receives `nativeLanguage` + `targetLanguage` from the user profile in the job payload.

### the agent's Discretion
- BullMQ connection setup (`src/lib/queue.ts`) and worker structure
- Extraction system prompt content — researcher recommends based on standard extraction patterns
- Error handling within the extraction worker (LLM call failures, parsing failures)
- Whether to batch multiple pending extraction jobs into one LLM call on the worker side
- `/review` command UX: embed design, button labels (Again/Hard/Good/Easy), prompt type rotation, exit behavior, empty queue handling — all open for the planner

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/PROJECT.md` — Project vision, constraints, extraction requirement context
- `.planning/REQUIREMENTS.md` — EXTR-01 through EXTR-06, REVW-01 through REVW-05

### Phase Definition
- `.planning/ROADMAP.md` §"Phase 4: Extraction & Review" — Goal, success criteria, requirements

### Technology Stack
- `AGENTS.md` — Stack decisions, BullMQ 5.x guidance, OpenAI SDK v6 guidance, what NOT to use

### Prior Phase Contracts
- `.planning/phases/03-fsrs-spaced-repetition-bank/03-CONTEXT.md` — FSRS service API (createItem, rateItem, getDueItems), ReviewItem model, decisions carried forward
- `.planning/phases/02-ai-conversation/02-CONTEXT.md` — Conversation flow, message schema, session model (extraction reads from this)

### Existing Code
- `src/services/fsrs.ts` — FSRS service that extraction pipeline calls to create items
- `src/services/conversation.ts` — `handleConversationMessage` — extraction hooks in after this returns
- `src/events/messageCreate.ts` — Where the extraction enqueue call gets added
- `src/lib/config.ts` — Zod env schema with REDIS_URL, EXTRACTION_MODEL already configured
- `prisma/schema.prisma` — ReviewItem, Session, Message, User models
- `src/types/session.ts` — ActiveSession type

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **FSRS service** (`src/services/fsrs.ts`) — `createItem()` ready to consume extraction output. Just call with extracted source + type + user context.
- **OpenAI client** — Already initialized in conversation service. Extraction can reuse the pattern or instantiate its own client.
- **Zod env config** (`src/lib/config.ts`) — `REDIS_URL` and `EXTRACTION_MODEL` env vars already defined. No schema changes needed.
- **Message handler** (`src/events/messageCreate.ts`) — Hook point: add extraction enqueue after `handleConversationMessage`.
- **Command-per-file pattern** — `/review` command follows same pattern as existing commands.

### Established Patterns
- **Service modules:** Exported functions in `src/services/`. Extraction worker lives here too.
- **Zod for runtime validation** — Extraction output validated with Zod schema before creation.
- **Graceful shutdown** (`src/index.ts`) — Extend to close BullMQ queue/worker connections on shutdown.

### Integration Points
- **`src/events/messageCreate.ts`** — After `handleConversationMessage`, enqueue extraction job
- **`src/index.ts`** — Initialize BullMQ worker on startup, add cleanup to shutdown
- **`package.json`** — Add `bullmq` and `ioredis` dependencies
- **`src/commands/`** — Add `/review` command
- **`src/types/`** — May need extraction queue job types

</code_context>

<specifics>
## Specific Ideas

- Extraction prompt: instruct GPT-4o-mini to analyze the user's message against their target language. Extract vocabulary items for new/unfamiliar words, grammar items for structural errors. Ignore mechanical typos. For code-switching, extract the target-language equivalent.
- Review flow: embed showing the card, buttons for FSRS rating, next card on button click, completion message when queue is empty.

</specifics>

<deferred>
## Deferred Ideas

- Review prompt generation (use-in-sentence / fill-in-blank / native-translation) — falls under the agent's discretion for the planner to design
- `/review` UI details (button style, embed format, prompt rotation) — open for implementation

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 4-Extraction & Review*
*Context gathered: 2026-07-20*
