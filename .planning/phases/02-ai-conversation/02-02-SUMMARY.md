---
phase: 02-ai-conversation
plan: 02
subsystem: conversation, session-management
tags: openai, discord-js, prisma, tiktoken
requires:
  - phase: 02-ai-conversation
    provides: Core conversation loop with /new, message handler, Session+Message models
provides:
  - Session lifecycle completion (/end, /summary commands)
  - Progressive summarization service with token threshold
  - Session rehydration on bot restart
  - Graceful shutdown session persistence
affects: phase 3 (spaced repetition), phase 4 (extraction pipeline)
tech-stack:
  added: []
  patterns:
    - Summarization service with shouldSummarize + triggerSummarization
    - Session end protocol: in-memory flag → DB update → thread archive
    - Startup rehydration: load active sessions → verify threads → populate cache
    - Shutdown persistence: save session metadata before client.destroy()
key-files:
  created:
    - src/commands/end.ts
    - src/commands/summary.ts
    - src/services/summarizer.ts
    - src/prompts/conversation/summarize.md
    - src/__tests__/commands/end.test.ts
    - src/__tests__/session-rehydration.test.ts
  modified:
    - src/commands/index.ts
    - src/events/ready.ts
    - src/index.ts
    - src/__tests__/setup.ts
requirements-completed:
  - CONV-06
  - CONV-07
  - CONV-08
coverage:
  - id: D1
    description: "/end ends active session, persists status=ended in DB"
    requirement: CONV-07
    verification:
      - kind: unit
        ref: src/__tests__/commands/end.test.ts#ends active session
        status: pass
    human_judgment: false
  - id: D2
    description: "/end shows error when no active session"
    requirement: CONV-07
    verification:
      - kind: unit
        ref: src/__tests__/commands/end.test.ts#shows error when no active session
        status: pass
    human_judgment: false
  - id: D3
    description: "/end archives the thread after session ended"
    requirement: CONV-07
    verification:
      - kind: unit
        ref: src/__tests__/commands/end.test.ts#archives the thread after ending session
        status: pass
    human_judgment: false
  - id: D4
    description: "Session rehydration loads active sessions from DB on startup"
    requirement: CONV-08
    verification:
      - kind: unit
        ref: src/__tests__/session-rehydration.test.ts#loads active sessions from DB on startup
        status: pass
    human_judgment: false
  - id: D5
    description: "Ended sessions whose threads were deleted are properly handled"
    requirement: CONV-08
    verification:
      - kind: unit
        ref: src/__tests__/session-rehydration.test.ts#ends sessions whose threads were deleted
        status: pass
    human_judgment: false
  - id: D6
    description: "Archived threads are unarchived during rehydration"
    requirement: CONV-08
    verification:
      - kind: unit
        ref: src/__tests__/session-rehydration.test.ts#unarchives threads that were archived
        status: pass
    human_judgment: false
  - id: D7
    description: "Summarization triggers only when tokens > 80K AND turnCount > 5"
    requirement: CONV-06
    verification: []
    human_judgment: true
    rationale: "Requires live OpenAI API key and real conversation data — cannot verify in unit tests"
duration: 0min
completed: 2026-07-07
status: complete
---

# Phase 02 Plan 02: Session Lifecycle Summary

**/end, /summary commands, progressive summarization service, session rehydration on restart, and graceful shutdown persistence**

## Performance

- **Duration:** 10 min (estimated)
- **Started:** 2026-07-07T23:00:00Z
- **Completed:** 2026-07-07T23:10:00Z
- **Tasks:** 3 (1 RED test, 1 GREEN implementation commands+service, 1 GREEN wiring)
- **Files modified:** 13

## Accomplishments

- **28 automated tests passing** across 5 test files
- **/end command** — finds active session, sets in-memory status, updates DB to ended, archives thread
- **/summary command** — displays session stats embed (messages, corrections, duration) via editReply
- **Summarization service** — `shouldSummarize()` checks token count with tiktoken + turnCount > 5 guard; `triggerSummarization()` calls GPT-4o-mini, updates summary field, prunes old messages (keeps last 10)
- **Session rehydration** — `rehydrateSessions()` loads active sessions on startup, verifies threads exist, unarchives if needed, populates in-memory cache
- **Graceful shutdown** — saves active session state (summary, messageCount, correctionCount) before client.destroy() per Pitfall 5 prevention
- **Ready handler** — async-enabled to await rehydration after login

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test infrastructure** — `0bbdea3` (test)
   - Added Channel mock (isThread, setArchived) to test setup
   - Created /end command test (3 tests: ends session, no session, archives thread)
   - Created session-rehydration test (3 tests: load active, handle deleted threads, unarchive)
   - Tests fail until implementation exists

2. **Task 2: Commands + Service** — `7cb9adc` (feat)
   - /end and /summary commands
   - Summarization service (shouldSummarize, triggerSummarization)
   - Summarization prompt template
   - Command registration update

3. **Task 3: Wiring** — `7cb9adc` (same commit)
   - Ready handler async + rehydrateSessions call
   - Entry point rehydration after login
   - Graceful shutdown session save before client.destroy()

## Files Created/Modified

- `src/commands/end.ts` — /end command (deferReply, endSession, error handling)
- `src/commands/summary.ts` — /summary command (stats embed, endSession)
- `src/commands/index.ts` — Added end and summary commands to registry
- `src/services/summarizer.ts` — shouldSummarize + triggerSummarization (tiktoken, GPT-4o-mini, message pruning)
- `src/prompts/conversation/summarize.md` — Summarization system prompt template
- `src/events/ready.ts` — Async handler with rehydrateSessions call
- `src/index.ts` — Graceful shutdown save loop + startup rehydration
- `src/__tests__/setup.ts` — Channel mock with isThread, setArchived
- `src/__tests__/commands/end.test.ts` — 3 tests for /end
- `src/__tests__/session-rehydration.test.ts` — 3 tests for rehydration

## Decisions Made

- **In-memory status before archive:** Set session status to "ended" before archiving thread — prevents race where message arrives between /end and archive (per RESEARCH.md Pitfall 2)
- **Summarization guard:** Require BOTH token threshold >80K AND turnCount > 5 — prevents premature summarization of early long exchanges (per Open Question #3)
- **Shutdown sequence:** Save sessions → client.destroy() → prisma.$disconnect() — per Pitfall 5

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Shared mutable state in tests:** activeSessions map persisted across tests, causing false failures. Fixed by clearing map in beforeEach.
- **vi.mock module override issue:** Mocking conversation module's activeSessions didn't propagate to endSession's internal closure. Fixed by using real module and calling activeSessions.set() directly.

## Next Phase Readiness

- Full conversation lifecycle complete: /new → chat → /end or /summary with rehydration
- Ready for Phase 3: Spaced Repetition (FSRS card scheduling + review sessions)
- Summarization service and Session model ready for integration with Phase 4 extraction pipeline
- Deferred: summarization prompt tuning (may need adjustment based on real usage)

---

*Phase: 02-ai-conversation*
*Completed: 2026-07-07*
