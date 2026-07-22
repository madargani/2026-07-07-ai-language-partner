# Language Partner Bot

## What This Is

An AI-driven language learning Discord bot that combines freeform conversational practice with spaced repetition. Users chat naturally in their target language, receive contextual corrections, and reinforce vocabulary/grammar through structured FSRS-based review sessions.

## Core Value

Users can practice a language through natural conversation, with corrections and spaced repetition working in the background to optimize retention — without breaking conversational flow.

## Current State

**Shipped:** v1.0 MVP — 2026-07-21

**What was built:**
- Discord bot with 7 slash commands (/setup, /new, /end, /summary, /review, /add-item, /ping)
- Natural conversation in target language with contextual corrections (max 2/msg)
- FSRS-5 spaced repetition engine for vocabulary and grammar items
- Background vocabulary extraction via BullMQ/Redis + GPT-4o-mini
- Structured review flow with 3 prompt types and FSRS rating buttons
- Rich session summaries with strengths, expansion metrics, and queue health
- Docker Compose orchestration (PostgreSQL 17, Redis 7, bot)

**Codebase:** 35 TypeScript files, ~3,800+ lines, 62 tests passing

## Requirements

### Validated

- ✓ /setup command for native/target language selection — v1.0
- ✓ Conversation sessions with target-language greetings and correction budgets — v1.0
- ✓ FSRS-based spaced repetition bank for vocabulary and grammar items — v1.0
- ✓ Background extraction pipeline that logs item performance from chat — v1.0
- ✓ Structured review flow with prompt types and FSRS rating input — v1.0
- ✓ Session summary with strengths, expansion metrics, and queue health — v1.0
- ✓ Multi-language support (LLM-driven, no per-language code) — v1.0
- ✓ Docker Compose deployment with PostgreSQL — v1.0

### Active

(New requirements to be defined for next milestone — run `/gsd-new-milestone` to define)

### Out of Scope

- Audio/pronunciation features — text-only v1; deferred to v2
- Public bot deployment — personal/private server only
- Web dashboard or mobile app — Discord-only interface
- Per-language grammar handlers — LLM handles all language parsing
- Gamification (streaks, XP) — anti-Duolingo positioning; targets serious adult learners
- OAuth / social login — Discord ID is the sole identity provider
- Real-time collaborative practice — no peer-to-peer or multi-user sessions
- Offline mode — real-time is core value

## Context

- **Bot persona:** Natural conversation partner — correction-light, flow-focused
- **Skill profile:** Inferred implicitly over time (starts at beginner)
- **Sessions:** Manual-only (/summary or /end) — no auto-expiry
- **Correction budget:** Max 2 major errors corrected per message
- **Code-switching:** Auto-extracts native terms into FSRS bank as new items
- **Extraction:** BullMQ/Redis background pipeline, GPT-4o-mini with Zod structured output
- **Review:** Template-based prompts (no LLM per card), FSRS rating buttons
- **Summary:** LLM strength analysis (gpt-4o-mini), expansion metrics, queue health
- **Testing:** 62 tests across 9 test files, all passing

## Constraints

- **Hosting**: Docker Compose orchestration
- **Database**: PostgreSQL 17 with Prisma ORM 6.x
- **AI Models**: High-tier (GPT-4o/Claude 3.5 Sonnet) for conversation, low-tier (GPT-4o-mini) for extraction + summary
- **Interface**: Discord slash commands via discord.js v14
- **SRS Algorithm**: ts-fsrs v5 (Free Spaced Repetition Scheduler)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM handles all language parsing | Avoids per-language maintenance burden | ✓ Good |
| Implicit skill profiling | No friction onboarding, adapts naturally | ✓ Good |
| Manual session management | User controls practice pacing | ✓ Good |
| Prisma 6 (not 7) | Avoid radical WebAssembly migration risk | ✓ Good |
| GPT-4o-mini for conversation | Cost-effective, good enough quality | ✓ Good |
| Delimiter-based correction format | Simplest implementation, no extra API cost | ✓ Good |
| ts-fsrs defaults for cold start | No custom constants needed | ✓ Good |
| BullMQ/Redis for extraction | Persistence, retries, monitoring | ✓ Good |
| Template-based review prompts | No LLM call per card (cost + latency savings) | ✓ Good |
| gpt-4o-mini for strength analysis | Follows summarizer.ts pattern, predictable cost | ✓ Good |
| Thread archive AFTER $transaction | Critical data before cosmetic cleanup | ✓ Good |
| SessionSummary explicit parameter | Data flow explicit, backward compatible | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

*Last updated: 2026-07-21 after v1.0 milestone*
