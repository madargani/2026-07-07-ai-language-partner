# Phase 3: FSRS Spaced Repetition Bank - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver vocabulary and grammar item management powered by ts-fsrs scheduling. This phase creates the ReviewItem Prisma model with full FSRS fields, an FSRS service layer wrapping ts-fsrs operations (create, rate, get due items, interval cap), and a manual `/add-item` command for testing and early use. The extraction pipeline (Phase 4) will be the primary item creation pathway — Phase 3 provides the bank infrastructure.

**Requirements (from REQUIREMENTS.md):** FSRS-01, FSRS-02, FSRS-03, FSRS-04, FSRS-05

**Success Criteria (from ROADMAP.md):**
1. Vocabulary items and grammar pattern items can be created with full FSRS fields (stability, difficulty, state, due, elapsed_days, scheduled_days, reps, lapses)
2. ts-fsrs algorithm correctly updates card scheduling when a rating (Again/Hard/Good/Easy) is submitted
3. New users start with seeded population parameters so first reviews produce sensible intervals (not zero/default values)
4. Review intervals for items under 3 months old are capped at 14 days maximum

</domain>

<decisions>
## Implementation Decisions

### Item Model Design
- **D-01:** Unified `ReviewItem` Prisma model with `type` enum field (`vocabulary` / `grammar`) — single table, not split
- **D-02:** Content fields: `source` (foreign word/phrase) only — no translation or example sentence fields. Grammar patterns use `source` for the pattern text
- **D-03:** FSRS fields on the model: `stability`, `difficulty`, `state` (int, maps to FSRS State enum), `due` (DateTime), `elapsedDays`, `scheduledDays`, `reps`, `lapses`. Plus user relation, language, type discriminator, createdAt, updatedAt

### Cold Start & Seeding
- **D-04:** Use ts-fsrs built-in default parameters for new items — no custom constants or DB seed migration. The `createItem()` function initialises FSRS state with library defaults
- **D-05:** Phase 3 includes a manual `/add-item` slash command for creating review items (testing + early use before Phase 4 extraction)
- **D-06:** Items created via `/add-item` accept: source text, type (vocabulary/grammar), and target language. The language defaults to the user's `targetLanguage` from their User profile

### Service Layering
- **D-07:** Single `src/services/fsrs.ts` service with public API: `createItem()`, `rateItem()`, `getDueItems()`, `getItem()`
- **D-08:** 14-day interval cap (FSRS-05) enforced inside `rateItem()` — always clamp intervals to 14 days for items < 3 months old
- **D-09:** `getDueItems()` filters items where `due <= now` for the requesting user, ordered by `due` ASC

### Testing Strategy
- **D-10:** Unit tests with mocked Prisma client — test FSRS scheduling logic (create, rate, cap) in isolation. Fast, no DB dependency

### Env & Config
- **D-11:** No new env vars needed for Phase 3. `ts-fsrs` needs to be added to `package.json` dependencies

### the agent's Discretion
- Exact Prisma field ordering, defaults, and column attributes — planner follows Prisma conventions
- `/add-item` command arg spec (which fields required vs optional) — researcher recommends based on UX patterns
- Mocking strategy for tests (vitest mock vs manual stubs) — planner decides
- Whether `getItem()` returns null or throws on not-found — planner follows existing codebase patterns

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/PROJECT.md` — Project vision, constraints, key decisions (SRS: ts-fsrs, Prisma ORM)
- `.planning/REQUIREMENTS.md` — FSRS-01 through FSRS-05 requirements

### Phase Definition
- `.planning/ROADMAP.md` §"Phase 3: FSRS Spaced Repetition Bank" — Goal, success criteria, requirements

### Technology Stack
- `AGENTS.md` — Stack decisions, ts-fsrs v5.4.x guidance, what NOT to use

### Prior Phase Contracts
- `.planning/phases/02-ai-conversation/02-CONTEXT.md` — Phase 2 decisions, existing Prisma models (User, Session, Message)
- `.planning/phases/02-ai-conversation/02-SUMMARY.md` — Built patterns: command-per-file, Prisma singleton, Zod config

### Existing Code
- `prisma/schema.prisma` — Current schema with User, Session, Message models. Add ReviewItem here
- `src/lib/config.ts` — Zod env config pattern
- `src/lib/prisma.ts` — Prisma singleton pattern
- `src/services/conversation.ts` — Existing service pattern for reference

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Prisma singleton** (`src/lib/prisma.ts`) — Ready to extend with ReviewItem model. GlobalThis cache pattern keeps single PrismaClient instance
- **Zod env config** (`src/lib/config.ts`) — Pattern established for env var validation. No new vars needed for Phase 3
- **Command-per-file** (`src/commands/`) — `/add-item` command follows same pattern as existing `/setup`, `/new`, `/summary`, `/end`
- **Command registration** (`src/deploy-commands.ts`) — Deploy new command with existing pattern

### Established Patterns
- **Type-safe config:** Zod schema parsed at startup
- **Service modules:** `src/services/conversation.ts` shows the module pattern (exported functions, internal state via Map)
- **Graceful shutdown** (`src/index.ts`) — Extend if needed, but FSRS data is already persisted via Prisma

### Integration Points
- **prisma/schema.prisma** — Add ReviewItem model with FK to User
- **src/lib/config.ts** — No new env vars needed
- **src/commands/** — Add `/add-item` command file
- **package.json** — Add `ts-fsrs` dependency (not yet installed)

</code_context>

<specifics>
## Specific Ideas

- `/add-item` command: user specifies source text, type (vocabulary/grammar), and optionally the target language (defaults to user's targetLanguage from profile)
- FSRS service should be a straightforward wrapper — no event emitters, no observers, no caching layer. Pure scheduling math + Prisma persistence

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-FSRS Spaced Repetition Bank*
*Context gathered: 2026-07-09*
