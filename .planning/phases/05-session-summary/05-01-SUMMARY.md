---
phase: "05"
plan: "05-01"
subsystem: database
tags: [prisma, postgres, session-summary, review-item, fsrs, extraction]
requires:
  - phase: "04"
    provides: extraction pipeline with ExtractionJobPayload.sessionId
  - phase: "03"
    provides: FSRS service (createItem, getDueItems, getItem)
  - phase: "02"
    provides: Session model, ReviewItem model, extraction types
  - phase: "01"
    provides: Prisma schema foundation, project conventions
provides:
  - SessionSummary Prisma model with 1:1 FK to Session
  - ReviewItem.sessionId nullable FK for session tracking
  - createItem() accepts optional sessionId in input
  - getQueueHealth() FSRS service function for 24h due-item count
  - Extraction worker stamps sessionId from job payload onto ReviewItems
affects:
  - 05-02 (summary command enhancement - will query SessionSummary and use queue health)
  - conversation.ts (endSession() will create SessionSummary record)
  - summary.ts (embed will display expansion metrics and queue health)
tech-stack:
  added: []
  patterns:
    - Prisma 1:1 relation via @unique FK on sessionId
    - FSRS service function with Prisma count() query
    - Extraction worker pass-through of optional payload field
key-files:
  created:
    - prisma/migrations/20260721090824_session_summary/migration.sql
  modified:
    - prisma/schema.prisma (SessionSummary model, ReviewItem.sessionId + indexes, Session.reviewItems + sessionSummary relations)
    - src/services/fsrs.ts (CreateItemInput.sessionId, sessionId pass-through, getQueueHealth())
    - src/services/extraction.ts (sessionId pass-through to createItem)
    - prisma/migrations/migration_lock.toml (auto-updated by Prisma)
key-decisions:
  - "Added ReviewItem.sessionId as optional nullable FK (String?) per D-06"
  - "SessionSummary uses @unique on sessionId for 1:1 relation with onDelete: Cascade per D-11"
  - "Added reviewItems ReviewItem[] and sessionSummary SessionSummary? back-relations on Session model (Prisma requires bi-directional relations)"
  - "getQueueHealth() added as exported FSRS service function per Option A recommendation from RESEARCH.md (Pattern 3)"
  - "Per D-07, dedup skip branch in extraction.ts NOT modified — sessionId only stamped at creation"
requirements-completed:
  - "SUMM-01"
  - "SUMM-03"
  - "SUMM-04"
  - "SUMM-05"
coverage:
  - id: D1
    description: "SessionSummary model exists in Prisma schema with 1:1 FK to Session"
    requirement: "SUMM-05"
    verification:
      - kind: unit
        ref: "prisma/schema.prisma#model SessionSummary"
        status: pass
    human_judgment: false
  - id: D2
    description: "ReviewItem has optional sessionId FK to Session"
    requirement: "SUMM-03"
    verification:
      - kind: unit
        ref: "prisma/schema.prisma#ReviewItem.sessionId"
        status: pass
    human_judgment: false
  - id: D3
    description: "createItem() accepts optional sessionId in input and passes to Prisma"
    requirement: "SUMM-03"
    verification:
      - kind: unit
        ref: "src/services/fsrs.ts#CreateItemInput.sessionId"
        status: pass
    human_judgment: false
  - id: D4
    description: "getQueueHealth() exists returning count of items due in next 24h"
    requirement: "SUMM-04"
    verification:
      - kind: unit
        ref: "src/services/fsrs.ts#getQueueHealth"
        status: pass
    human_judgment: false
  - id: D5
    description: "Extraction worker stamps sessionId from job payload onto new ReviewItems"
    requirement: "SUMM-03"
    verification:
      - kind: unit
        ref: "src/services/extraction.ts#processExtractionJob createItem call"
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-07-21
status: complete
---

# Phase 5 Plan 1: Session Summary Data Infrastructure

**ReviewItem.sessionId FK, SessionSummary Prisma model, FSRS getQueueHealth(), and extraction pipeline sessionId pass-through**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-21T09:06:34Z
- **Completed:** 2026-07-21T09:10:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `sessionId` (String?, optional FK → Session) to `ReviewItem` Prisma model with `@@index([sessionId])`
- Created `SessionSummary` Prisma model with 1:1 relation to Session (unique FK, onDelete: Cascade), storing `strengths` (Json?), `expandedCount` (Int), `queueHealth` (Int), `summary` (String?) and timestamps
- Generated and applied `session_summary` Prisma migration
- Extended `CreateItemInput` with optional `sessionId` field and pass-through to `prisma.reviewItem.create()` in `createItem()`
- Added `getQueueHealth(userId)` function to FSRS service that counts ReviewItems due within the next 24 hours
- Wired extraction worker (`processExtractionJob`) to stamp `sessionId` from job payload onto newly created ReviewItems
- All 55 existing tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ReviewItem.sessionId FK and create SessionSummary model** - `07055eb` (feat)
2. **Task 2: Extend FSRS service with optional sessionId and getQueueHealth()** - `ef5880f` (feat)
3. **Task 3: Pass sessionId from extraction job payload to createItem()** - `562736f` (feat)

## Files Created/Modified

- `prisma/schema.prisma` - Added `sessionId` (String?) + `session` relation to ReviewItem; added `SessionSummary` model; added `reviewItems` + `sessionSummary` back-relations to Session; added `@@index([sessionId])` indexes
- `prisma/migrations/20260721090824_session_summary/migration.sql` - Generated migration adding ReviewItem.sessionId, SessionSummary table with FK and unique constraint, indexes
- `prisma/migrations/migration_lock.toml` - Auto-updated by Prisma migrate
- `src/services/fsrs.ts` - Extended `CreateItemInput` with `sessionId?: string`, added pass-through in `createItem()`, added `getQueueHealth()` function
- `src/services/extraction.ts` - Added `sessionId: data.sessionId` to `createItem()` call

## Decisions Made

- Prisma required adding `reviewItems ReviewItem[]` and `sessionSummary SessionSummary?` to the Session model as back-relations — these were not in the original plan but are necessary for Prisma to validate the bi-directional relations
- Followed the RESEARCH.md Option A recommendation: added `getQueueHealth()` as an exported FSRS service function rather than an inline query
- Did NOT modify the dedup skip branch in extraction.ts per D-07

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added back-relation fields on Session model for Prisma validation**
- **Found during:** Task 1 (schema validation)
- **Issue:** `npx prisma validate` failed with "The relation field `session` on model `ReviewItem` is missing an opposite relation field on the model `Session`"
- **Fix:** Added `reviewItems ReviewItem[]` and `sessionSummary SessionSummary?` to the Session model
- **Files modified:** `prisma/schema.prisma`
- **Verification:** `npx prisma validate` exits 0, `npx tsc --noEmit` exits 0
- **Committed in:** `07055eb` (Task 1 commit)

**2. [Rule 3 - Blocking] Added port mapping to docker-compose.yml for database connectivity**
- **Found during:** Task 1 (migration generation)
- **Issue:** Prisma migration requires database connection. PostgreSQL running in Docker has no host port mapping, so `postgres:5432` (Docker service name) doesn't resolve from host
- **Fix:** Added `ports: ["5432:5432"]` to docker-compose.yml postgres service
- **Files modified:** `docker-compose.yml` (not committed — kept as uncommitted change for development environment)
- **Verification:** Migration ran successfully with `DATABASE_URL` pointing to `localhost:5432`
- **Note:** This is a development convenience; the port mapping was not part of the plan's scope

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking)
**Impact on plan:** Both fixes were necessary to complete the plan. No scope creep.

## Issues Encountered

- **Database connectivity for Prisma migration:** PostgreSQL runs in Docker with no host port mapping. Resolved by adding a temporary port mapping to docker-compose.yml. Alternative approaches (docker exec, running inside bot container) would be more complex.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: none | — | No new network endpoints, auth paths, or trust boundaries introduced. sessionId is sourced from validated job payload (T-05-01 mitigated by existing Zod validation) |

## Next Phase Readiness

- Data infrastructure complete for Plan 05-02 (summary command enhancement)
- SessionSummary model ready to be created in `endSession()` transaction
- `getQueueHealth()` available for queue health display
- Expansion metrics queryable via `prisma.reviewItem.count({ where: { sessionId } })`
- Existing tests pass — no regressions introduced

## Self-Check: PASSED

All 10 self-check items passed (models verified, migration found, commits present, TypeScript compiles, all 55 tests pass).

---

*Phase: 05-session-summary*
*Completed: 2026-07-21*
