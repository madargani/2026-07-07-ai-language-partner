# Phase 3: FSRS Spaced Repetition Bank - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 3-FSRS Spaced Repetition Bank
**Areas discussed:** Item model design, Cold start & seeding, Service layering, Testing strategy

---

## Item Model Design

| Option | Description | Selected |
|--------|-------------|----------|
| Unified table with type field | One ReviewItem model with 'type' enum (vocabulary/grammar). Simpler Prisma schema. | ✓ |
| Separate tables | ReviewItem for vocabulary, GrammarItem for grammar. More schema flexibility. | |

**User's choice:** Unified table with type field
**Notes:** User chose unified model. Rejecting separate tables for Phase 3.

### Content field follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal: source + translation | source (foreign) + translation (native) | |
| Structured: source + translation + example | Adds exampleSentence field | |
| Flexible JSON blob | Store as JSON, schema decided by Phase 4 | |
| User proposed alternative | "Can we just do foreign word without translation?" | ✓ |

**User's choice:** Just `source` (foreign word/phrase), no translation field
**Notes:** Minimal approach — source text only.

---

## Cold Start & Seeding

| Option | Description | Selected |
|--------|-------------|----------|
| ts-fsrs defaults in code | Use ts-fsrs built-in defaults for new cards | ✓ |
| Custom defaults as constants | DEFAULT_FSRS_PARAMS constant exported from service | |
| DB seed migration | Store parameters in Settings table or migration | |

**User's choice:** ts-fsrs defaults in code
**Notes:** Simple, no DB seed or custom constants needed.

### Creation scope follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Model + service only | Phase 3 delivers model, service, tests. Phase 4 creates items. | |
| Include /add-item command | Add slash command to manually create review items | ✓ |

**User's choice:** Include /add-item command
**Notes:** Manual command for testing and early use before Phase 4 extraction.

---

## Service Layering

| Option | Description | Selected |
|--------|-------------|----------|
| Single service — all functions | src/services/fsrs.ts with createItem(), rateItem(), getDueItems(), getItem() | ✓ |
| Split into data + scheduler | fsrs.ts (scheduling) + CRUD in persistence layer | |

**User's choice:** Single service — all functions
**Notes:** Clean interface, not over-engineered.

### 14-day cap (FSRS-05) follow-up

| Option | Description | Selected |
|--------|-------------|----------|
| Inside FSRS service's rateItem() | Cap enforced as part of scheduling function | ✓ |
| Utility wrapper around ts-fsrs | Separate applyIntervalCap() called after ts-fsrs schedule | |

**User's choice:** Inside FSRS service's rateItem()
**Notes:** Keep the cap logic co-located with the scheduling.

---

## Testing Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests with mocked Prisma | Mock Prisma, test FSRS logic in isolation | ✓ |
| Integration tests with real Prisma | Full stack with test DB | |
| Both | Unit for logic, integration for persistence | |

**User's choice:** Unit tests with mocked Prisma
**Notes:** Fast, no DB dependency for math-heavy scheduling tests.

---

## the agent's Discretion

- Exact Prisma field ordering, defaults, column attributes
- `/add-item` command argument spec (required vs optional fields)
- Mocking strategy for tests (vitest mock vs manual stubs)
- `getItem()` not-found behavior (null vs throw)

## Deferred Ideas

None — discussion stayed within phase scope.
