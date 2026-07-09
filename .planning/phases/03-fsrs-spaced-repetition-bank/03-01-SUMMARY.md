---
phase: 03-fsrs-spaced-repetition-bank
plan: 01
subsystem: database, api
tags: fsrs, spaced-repetition, ts-fsrs, prisma, review-item

# Dependency graph
requires:
  - phase: 01-foundation-setup
    provides: Prisma User model, Prisma singleton, command-per-file pattern
provides:
  - ReviewItem Prisma model with FSRS scheduling fields
  - FSRS service layer (createItem, rateItem, getDueItems, getItem)
  - /add-item slash command for manual review item creation
  - Unit tests for all FSRS service functions
affects:
  - 04-extraction-pipeline (will use createItem for auto-extraction)
  - 04-review-flow (will use getDueItems, rateItem)

# Tech tracking
tech-stack:
  added: ts-fsrs@^5.4.1
  patterns:
    - TS-FSRS integration: scheduler singleton at module level, Card reconstruction from persisted fields
    - Interval cap: 14-day cap for items < 3 months old enforced inside rateItem
    - Service layer: 4 exported functions wrapping ts-fsrs operations with Prisma persistence

key-files:
  created:
    - src/services/fsrs.ts
    - src/commands/add-item.ts
    - src/__tests__/fsrs.test.ts
  modified:
    - prisma/schema.prisma
    - src/commands/index.ts
    - src/__tests__/setup.ts

key-decisions:
  - "All decisions from CONTEXT.md (D-01 through D-11) followed without change"
  - "Use Grade type from ts-fsrs (1|2|3|4) for scheduler.next() cast, not Rating (which includes Manual=0)"

patterns-established:
  - "FSRS Card reconstruction: reconstruct ALL Card fields from Persisted fields before calling scheduler.next()"
  - "Interval cap mutates both scheduled_days and due together"
  - "Dynamic imports in tests: tests import service modules inside test functions for late binding"

requirements-completed:
  - FSRS-01
  - FSRS-02
  - FSRS-03
  - FSRS-04
  - FSRS-05

coverage:
  - id: D1
    description: "Vocabulary items stored with full FSRS fields (stability, difficulty, state, etc.) via createItem()"
    requirement: FSRS-01
    verification:
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#creates a vocabulary item with FSRS default fields"
        status: pass
    human_judgment: false
  - id: D2
    description: "Grammar pattern items stored with same FSRS fields via createItem() with type=grammar"
    requirement: FSRS-02
    verification:
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#creates a grammar item with FSRS default fields"
        status: pass
    human_judgment: false
  - id: D3
    description: "ts-fsrs algorithm updates scheduling on each review via rateItem() with Good rating"
    requirement: FSRS-03
    verification:
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#updates scheduling after Good rating"
        status: pass
    human_judgment: false
  - id: D4
    description: "14-day interval cap for items < 3 months old enforced inside rateItem()"
    requirement: FSRS-05
    verification:
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#applies 14-day cap for items < 3 months old"
        status: pass
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#does not cap intervals for items > 3 months old"
        status: pass
    human_judgment: false
  - id: D5
    description: "Cold start handled with ts-fsrs default parameters — no custom constants or DB seed"
    requirement: FSRS-04
    verification: []
    human_judgment: true
    rationale: "Cold-start behavior must be verified manually via Discord — run /add-item and inspect DB values via Prisma Studio"
  - id: D6
    description: "/add-item slash command creates items and replies with confirmation"
    verification:
      - kind: other
        ref: "Manual Discord verification required — deploy-commands.ts then run /add-item in Discord"
        status: unknown
    human_judgment: true
    rationale: "Slash command requires Discord client interaction to verify"
  - id: D7
    description: "getDueItems() returns only items where due <= now for the requesting user, ordered ASC"
    verification:
      - kind: unit
        ref: "src/__tests__/fsrs.test.ts#returns items with due <= now, ordered ASC"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-09
status: complete
---

# Phase 3 Plan 1: FSRS Spaced Repetition Bank — Summary

**ReviewItem Prisma model with full FSRS-5 scheduling fields, ts-fsrs service layer (createItem/rateItem/getDueItems/getItem) with 14-day interval cap, /add-item slash command, and comprehensive unit tests**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-07-09
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- ReviewItem Prisma model with all FSRS scheduling fields (stability, difficulty, state, due, elapsedDays, scheduledDays, reps, lapses) plus userId FK to User, language, and type discriminator
- FSRS service layer (src/services/fsrs.ts) with 4 exported functions:
  - createItem: creates vocabulary/grammar items using ts-fsrs createEmptyCard() defaults
  - rateItem: fetches item, reconstructs Card, calls scheduler.next(), applies 14-day cap, persists
  - getDueItems: queries items where due <= now for user, ordered by due ASC
  - getItem: returns item by ID or null
- /add-item slash command: accepts source text, type (vocabulary/grammar), and optional language (defaults to user's targetLanguage); checks user configuration before creating item
- 9 unit tests for all FSRS service functions (with mocked Prisma) — all passing

## Task Commits

1. **Task 1: Wave 0 — Create test infrastructure and failing tests** — `7d32815` (test)
2. **Task 2: Implement Prisma model, FSRS service, /add-item command, wire everything** — `ed67869` (feat)

## Files Created/Modified

### Created
- `src/services/fsrs.ts` — FSRS service: createItem, rateItem, getDueItems, getItem
- `src/commands/add-item.ts` — /add-item slash command handler
- `src/__tests__/fsrs.test.ts` — 9 unit tests for FSRS service

### Modified
- `prisma/schema.prisma` — Added ReviewItem model + reviewItems relation on User
- `src/commands/index.ts` — Registered add-item command
- `src/__tests__/setup.ts` — Added reviewItem mock to PrismaMock type and mock object

## Decisions Made

All decisions from CONTEXT.md (D-01 through D-11) were followed without change:
- D-01: Unified ReviewItem model with type discriminator (vocabulary/grammar)
- D-02: Content fields: source only — no translation or example sentences
- D-03: Full FSRS fields on model
- D-04: ts-fsrs built-in default parameters (no custom constants)
- D-05: Manual /add-item command included
- D-06: /add-item accepts source, type, optional language (defaults to user's targetLanguage)
- D-07: Single fsrs.ts service with 4 exports
- D-08: 14-day cap inside rateItem()
- D-09: getDueItems filters due <= now, ordered ASC
- D-10: Unit tests with mocked Prisma
- D-11: No new env vars, ts-fsrs added to dependencies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ts-fsrs Grade type cast in rateItem()**
- **Found during:** Task 2 (TypeScript compilation check)
- **Issue:** The plan specified `input.rating as Rating` for the scheduler.next() grade argument. However, ts-fsrs v5.4.1's `scheduler.next()` expects `Grade` type (Exclude<Rating, Rating.Manual> = 1|2|3|4), not `Rating` (0|1|2|3|4). The `Rating` type includes `Rating.Manual=0`, making it unassignable to `Grade`.
- **Fix:** Changed the cast from `as Rating` to `as Grade`, importing `type { Grade }` from ts-fsrs
- **Files modified:** `src/services/fsrs.ts`
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `ed67869` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor type-level fix. Functionally identical to the plan's intent. No scope creep.

## Issues Encountered

- **Prisma db push with Docker hostname**: The initial `npx prisma db push` command failed because the DATABASE_URL uses the Docker hostname `postgres`, which is only resolvable from inside Docker. Worked around by overriding to `localhost:5432` via environment variable.

## User Setup Required

None — no external service configuration required. ts-fsrs is already in package.json dependencies.

## Next Phase Readiness

- FSRS bank complete and ready for Phase 4 extraction pipeline
- /add-item command available for manual testing and early use
- getDueItems and rateItem ready for Phase 4 review flow
- All service functions export correctly typed interfaces

## Self-Check: PASSED

- [x] All created files exist (src/services/fsrs.ts, src/commands/add-item.ts, src/__tests__/fsrs.test.ts)
- [x] All commits exist (7d32815 — test, ed67869 — feat)
- [x] 37/37 tests pass across 6 test files

---
*Phase: 03-fsrs-spaced-repetition-bank*
*Plan: 01*
*Completed: 2026-07-09*
