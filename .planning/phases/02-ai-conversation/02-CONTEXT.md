# Phase 2: AI Conversation - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver natural target-language conversation sessions with LLM-powered responses and contextual corrections. Users start sessions via `/new`, converse in their target language in private Discord threads, receive GPT-4o-mini responses with inline correction annotations (max 2 per message), and end sessions via `/summary` or `/end`. Session state persists to PostgreSQL and rehydrates on restart. Context is progressively summarized after dynamic token thresholds to control costs.

**Requirements (from REQUIREMENTS.md):** CONV-01 through CONV-08, SETUP-04, INFRA-03

**Success Criteria (from ROADMAP.md):**
1. User can start a session with /new and receive a target-language greeting matching their skill profile
2. User sends messages in the target language and the bot responds naturally with corrections shown in a separate embed block
3. Corrections are capped at max 2 major errors per message (user sees no more than 2 regardless of actual errors)
4. Session survives bot restart — state rehydrates from PostgreSQL and conversation can resume
5. Session context summarizes after 20 turns to control costs; only /summary or /end closes a session

</domain>

<decisions>
## Implementation Decisions

### LLM Provider & Model
- **D-01:** OpenAI SDK v6 for the conversation model — primary LLM SDK for this phase
- **D-02:** Model: `gpt-4o-mini` (not full GPT-4o) — cost-effective choice for single-user bot. The stack calls this "low-tier" but it's the sole conversation model for Phase 2.
- **D-03:** System prompt lives in `prompts/` directory as template files (not hardcoded) — easier to iterate without code changes
- **D-04:** New env vars: `OPENAI_API_KEY` (add to Zod config schema, `.env.example`, and Docker Compose)

### Session Threading (Discord)
- **D-05:** Each `/new` creates a **private Discord thread** per session — clean message-to-session mapping
- **D-06:** Thread named by user's `/new [session_name]` argument — date-based fallback if no name provided
- **D-07:** Thread auto-archived when session ends via `/summary` or `/end`

### Correction UX
- **D-08:** Single Discord message per response — correction block on top, divider, natural response below
- **D-09:** Correction style: inline annotated reply (bot quotes user input with corrections in context)
- **D-10:** When user message has no errors: show "No errors found!" — positive reinforcement
- **D-11:** Correction scope: all types (grammar, vocabulary, style/naturalness) — budget-2 cap naturally prioritizes
- **D-12:** Same error repeated across messages: treated independently each time (no "recurring pattern" flagging)

### Context Management
- **D-13:** Progressive summarization — GPT-4o-mini builds a running summary of the conversation
- **D-14:** Trigger: dynamic token threshold (not fixed turn count) — summarize when context approaches cost limit. Keep last few messages verbatim alongside the summary for LLM context
- **D-15:** Summary stored in PostgreSQL Session model `summary` field — persists for rehydration (CONV-08)

### Bot Persona
- **D-16:** Personality: native conversation partner (casual, natural, correction-light, flow-focused)
- **D-17:** Greeting: target-language immersion (appropriate to implied skill level)
- **D-18:** Skill adaptation: implicit only — no explicit skill_level field. LLM naturally adjusts from conversation quality (SETUP-04)

### Session Data Model (Prisma)
- **D-19:** New models: `Session` and `Message` — full message content stored in PostgreSQL
- **D-20:** Session fields: id, userId (FK → User), discordThreadId, status (active/ended/archived), summary (text), messageCount, correctionCount, createdAt, endedAt, updatedAt
- **D-21:** Message fields: id, sessionId (FK → Session), role (user/assistant), content (full text), hasCorrections (boolean), createdAt
- **D-22:** User model stays minimal — no skill_level or session fields on User. Session carries per-session metadata

### Infra (Env & Config)
- **D-23:** Add `OPENAI_API_KEY` to Zod env schema and `.env.example` — required for GPT-4o-mini access
- **D-24:** Graceful shutdown (Phase 1 pattern) extended: save active session state to PostgreSQL on SIGTERM/SIGINT (implements CONV-08 and closes deferred item from Phase 1 D-13)

### the agent's Discretion
- Session model exact field ordering and defaults — planner decides based on Prisma conventions
- Message storage pruning policy (retention, cleanup) — planner determines if cleanup is needed
- Prompts directory structure (`prompts/conversation/system.md`, etc.) — researcher recommends layout
- Exact token threshold for summarization trigger — researcher determines based on gpt-4o-mini context window

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/PROJECT.md` — Project vision, constraints, key decisions (bot persona, correction-light approach)
- `.planning/REQUIREMENTS.md` — All v1 requirements (CONV-01 through CONV-08, SETUP-04, INFRA-03)

### Phase Definition
- `.planning/ROADMAP.md` §"Phase 2: AI Conversation" — Goal, success criteria, requirements

### Technology Stack
- `AGENTS.md` — Stack decisions, version choices, OpenAI SDK v6 guidance, what NOT to use

### Prior Phase Contracts
- `.planning/phases/01-foundation-setup/01-CONTEXT.md` — Phase 1 decisions that carry forward (D-01 source structure, D-09 skill fields deferred, D-13 session save deferred, D-17 LLM keys deferred)
- `.planning/phases/01-foundation-setup/01-SUMMARY.md` — Built patterns: command-per-file, Prisma singleton, Zod config, graceful shutdown, Docker Compose

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Prisma singleton** (`src/lib/prisma.ts`) — Ready to use for Session/Message models. GlobalThis cache pattern keeps single PrismaClient instance.
- **Zod env config** (`src/lib/config.ts`) — Add `OPENAI_API_KEY` to existing schema. Pattern established.
- **Graceful shutdown** (`src/index.ts`) — Extend with active-session save before client.destroy(). Phase 1 implementation already has the pattern.
- **Command dispatch** (`src/events/interactionCreate.ts`) — `/new`, `/summary`, `/end` commands follow same pattern as existing ones.

### Established Patterns
- **Command-per-file:** Each command in its own `.ts` file with `command: Command` named export
- **deferReply() first:** All command handlers call `deferReply()` as first async operation
- **Source by type:** `src/commands/`, `src/events/`, `src/lib/`, `src/types/` — Phase 1 deferred feature-based dirs to Phase 2

### Integration Points
- **User model** (`prisma/schema.prisma`) — Add Session → User relation (one-to-many)
- **Docker Compose** — No changes needed for Phase 2 (OpenAI API accessed externally, no new services)
- **Env config** — Add `OPENAI_API_KEY` to both Zod schema and Docker Compose env vars

</code_context>

<specifics>
## Specific Ideas

- "Native conversation partner" persona: casual, natural speaker. Not a teacher. Corrects gently when needed but keeps conversation flowing. "Yeah, I understood what you meant! By the way, in Spanish we'd say..."
- The `/new` command should accept an optional session name argument per CONV-01
- Threads are private — only the user and bot see conversation history

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 2-AI Conversation*
*Context gathered: 2026-07-07*
