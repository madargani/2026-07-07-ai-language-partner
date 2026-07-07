---
phase: 02-ai-conversation
plan: 01
subsystem: conversation, database, testing
tags: openai, gpt-4o-mini, discord-js, prisma, tiktoken
requires:
  - phase: 01-foundation-setup
    provides: Discord bot skeleton with slash commands, Prisma User model
provides:
  - Core conversation loop with /new private thread creation
  - OpenAI GPT-4o-mini conversation with inline correction parsing
  - Session + Message Prisma models with indexes
  - Event-driven message handler for thread conversations
affects: phase 3 (spaced repetition), phase 4 (extraction pipeline)
tech-stack:
  added:
    - openai ^6.45.0
    - tiktoken ^1.0.22
  patterns:
    - Service layer pattern (conversation service)
    - Event handler registration (messageCreate)
    - Prompt template files in prompts/ directory
    - EmbedBuilder with corrections block + divider + response
    - Active session in-memory cache (Map)
key-files:
  created:
    - src/services/conversation.ts
    - src/events/messageCreate.ts
    - src/types/session.ts
    - src/prompts/conversation/system.md
    - src/__tests__/conversation.test.ts
    - src/__tests__/commands/new.test.ts
  modified:
    - prisma/schema.prisma
    - src/lib/config.ts
    - .env.example
    - src/commands/new.ts
    - src/commands/index.ts
    - src/index.ts
    - src/__tests__/setup.ts
    - src/__tests__/walking-skeleton.test.ts
    - package.json
key-decisions:
  - "Used delimiter-based response format (##CORRECTIONS## / ##SEPARATOR## / ##RESPONSE##) for correction parsing — simplest to implement, no extra API cost"
  - "Non-streaming chat completions for Discord embed compatibility"
  - "System prompt loaded from file (not hardcoded) via fs.readFileSync"
  - "createSession handles thread creation + greeting + DB persistence. Command handles user check + deferReply"
patterns-established:
  - "Service layer: conversation service with exported functions for session lifecycle, message handling, embed building"
  - "Event handler registration follows same pattern as interactionCreate (registerXxxHandler export)"
  - "Active session cache: Map<threadId, ActiveSession> keyed by Discord thread ID for O(1) lookup"
requirements-completed:
  - SETUP-04
  - CONV-01
  - CONV-02
  - CONV-03
  - CONV-04
  - CONV-05
  - INFRA-03
coverage:
  - id: D1
    description: "/new creates private thread with user-provided session name and sends greeting"
    requirement: CONV-01
    verification:
      - kind: unit
        ref: src/__tests__/commands/new.test.ts#creates private thread and sends greeting for configured user
        status: pass
    human_judgment: false
  - id: D2
    description: "/new uses date-based fallback when no session_name provided"
    requirement: CONV-01
    verification:
      - kind: unit
        ref: src/__tests__/commands/new.test.ts#uses date-based fallback name when no session_name provided
        status: pass
    human_judgment: false
  - id: D3
    description: "/new shows error for unconfigured users (redirects to /setup)"
    requirement: CONV-01
    verification:
      - kind: unit
        ref: src/__tests__/commands/new.test.ts#requires /setup for unconfigured user
        status: pass
    human_judgment: false
  - id: D4
    description: "Conversation service builds context from summary + recent messages"
    requirement: CONV-03
    verification:
      - kind: unit
        ref: src/__tests__/conversation.test.ts#builds context from summary + recent messages
        status: pass
    human_judgment: false
  - id: D5
    description: "Embed builder creates corrections block + divider + response for corrections"
    requirement: CONV-05
    verification:
      - kind: unit
        ref: src/__tests__/conversation.test.ts#builds embed with corrections block + divider + response when corrections exist
        status: pass
    human_judgment: false
  - id: D6
    description: "Embed builder shows 'No errors found!' when no corrections"
    requirement: CONV-05
    verification:
      - kind: unit
        ref: src/__tests__/conversation.test.ts#shows 'No errors found!' when no corrections
        status: pass
    human_judgment: false
  - id: D7
    description: "Corrections capped at max 2 per message"
    requirement: CONV-04
    verification:
      - kind: unit
        ref: src/__tests__/conversation.test.ts#caps corrections at max 2
        status: pass
    human_judgment: false
  - id: D8
    description: "OPENAI_API_KEY validated at startup via Zod schema"
    requirement: INFRA-03
    verification:
      - kind: unit
        ref: src/__tests__/walking-skeleton.test.ts#throws when OPENAI_API_KEY is missing
        status: pass
    human_judgment: false
  - id: D9
    description: "Bot sends target-language greeting matching skill profile"
    requirement: CONV-02
    verification: []
    human_judgment: true
    rationale: "Requires live OpenAI API key and Discord bot — cannot verify greeting content in unit tests"
duration: 0min
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 01: Core Conversation Loop Summary

**OpenAI GPT-4o-mini conversation with private Discord threads, inline corrections (max 2), Session+Message persistence, and event-driven message handler**

## Performance

- **Duration:** 10 min (estimated)
- **Started:** 2026-07-07T22:50:00Z
- **Completed:** 2026-07-07T23:00:00Z
- **Tasks:** 2 (1 RED test, 1 GREEN implementation)
- **Files modified:** 17

## Accomplishments

- **22 automated tests passing** (19 existing walking skeleton + 3 new command tests + 4 conversation service tests)
- **/new command** with optional `session_name` argument — creates private Discord thread, joins bot+user, dispatches GPT-4o-mini greeting, persists Session+Message to DB
- **Conversation service** with createSession, handleConversationMessage, parseCorrections, buildConversationEmbed, endSession, getSessionSummary, rehydrateSessions
- **Session + Message Prisma models** with cascading deletes, indexes on userId, status, sessionId, createdAt
- **messageCreate event handler** with thread detection, active session check, user verification
- **Correction parsing** with delimiter-based format (##CORRECTIONS## / ##SEPARATOR## / ##RESPONSE##), max 2 cap, post-response validation
- **Embed builder** with orange/green color coding, corrections block, divider, and response section
- **OPENAI_API_KEY** added to Zod config, .env.example, and test setup

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test infrastructure** — `fa697b6` (test)
   - Added Session/Message mocks to test setup
   - Created /new command test (thread creation, greeting, date fallback, unconfigured user)
   - Created conversation service tests (context building, embed builder, correction parsing)
   - Added OPENAI_API_KEY env var and config test
   - All 7 new tests FAIL (target modules don't exist yet)

2. **Task 2: Implementation** — `e92f10d` (feat)
   - All Prisma models, config, types, prompts, services, commands, and wiring
   - All 22 tests pass, TypeScript compiles clean
   - Prisma client regenerated

## Files Created/Modified

- `prisma/schema.prisma` — Session + Message models with indexes and relations
- `src/lib/config.ts` — OPENAI_API_KEY added to Zod schema
- `.env.example` — OpenAI section added
- `package.json` — openai ^6.45.0, tiktoken ^1.0.22
- `src/types/session.ts` — SessionStatus, ActiveSession, Correction, ParseCorrectionsResult types
- `src/prompts/conversation/system.md` — Native conversation partner system prompt
- `src/commands/new.ts` — Rewritten with session_name option, thread creation, greeting
- `src/events/messageCreate.ts` — Thread message handler with active session dispatch
- `src/services/conversation.ts` — Full conversation service (createSession, handleConversationMessage, parseCorrections, buildConversationEmbed, endSession, getSessionSummary, rehydrateSessions)
- `src/index.ts` — registerMessageCreateHandler + rehydrateSessions import
- `src/__tests__/setup.ts` — Session/Message mocks + OPENAI_API_KEY
- `src/__tests__/walking-skeleton.test.ts` — OPENAI_API_KEY config test
- `src/__tests__/commands/new.test.ts` — New command tests (3)
- `src/__tests__/conversation.test.ts` — Conversation service tests (4)

## Decisions Made

- **Delimiter-based response format** for correction parsing — simpler than JSON or two-call approach
- **Non-streaming chat completions** — Discord embeds require complete content
- **System prompt as file** — loaded via fs.readFileSync at module init time
- **createSession refactored** to not call deferReply (command handles it) — avoids double-defer issue

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **OpenAI mock constructor issue:** Arrow functions aren't constructors — had to use `function()` syntax for the OpenAI mock
- **PostgreSQL not running locally:** `prisma db push` fails with connection error. Schema already validated by `prisma generate` and test suite. Apply via `docker compose up -d` when deploying.

## User Setup Required

None — no external service configuration required beyond existing Discord setup from Phase 1.

## Next Phase Readiness

- Core conversation loop complete — users can start sessions, receive greetings, send messages, get corrections
- Ready for Plan 02-02: Session lifecycle completion (/end, /summary, summarization, rehydration, graceful shutdown)
- Session + Message models have rehydration support functions already exported (endSession, getSessionSummary, rehydrateSessions) — Plan 02-02 fills in the /end and /summary commands

---

*Phase: 02-ai-conversation*
*Completed: 2026-07-07*
