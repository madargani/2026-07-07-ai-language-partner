# Milestones

## v1.0 — MVP

**Shipped:** 2026-07-21
**Phases:** 5 | **Plans:** 8 | **Tasks:** ~25
**Tests:** 62 passing
**Tag:** v1.0
**Closeout:** override_closeout (tech debt accepted)
**Known verification overrides:** 4 (see STATE.md Deferred Items)

### Key Accomplishments

1. Discord bot skeleton with language setup — Docker Compose orchestration (bot + PostgreSQL + Redis), /setup command with ISO 639-1 select menus, Prisma User model, graceful shutdown
2. Natural conversation with contextual corrections — GPT-4o-mini conversation in private threads, correction budget (max 2/msg), delimiter-based parsing, progressive summarization, session rehydration
3. FSRS-5 spaced repetition engine — ReviewItem model with full scheduling fields, ts-fsrs integration, 14-day interval cap, /add-item command
4. Background vocabulary extraction — BullMQ/Redis pipeline with GPT-4o-mini + Zod structured output, semantic filtering, code-switching detection, dedup
5. Structured review flow — /review command with Again/Hard/Good/Easy buttons, 3 prompt types, recursive card flow, idle timeout
6. Rich session summaries — LLM strength analysis, expansion metrics, queue health, SessionSummary persistence via $transaction
