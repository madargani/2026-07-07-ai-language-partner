# Language Partner Bot

## What This Is

An AI-driven language learning Discord bot that combines freeform conversational practice with spaced repetition. Users chat naturally in their target language, receive contextual corrections, and reinforce vocabulary/grammar through structured FSRS-based review sessions.

## Core Value

Users can practice a language through natural conversation, with corrections and spaced repetition working in the background to optimize retention — without breaking conversational flow.

## Business Context

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Conversation sessions with target-language greetings and correction budgets
- [ ] FSRS-based spaced repetition bank for vocabulary and grammar items
- [ ] Background extraction pipeline that logs item performance from chat
- [ ] Structured review flow with prompt types and FSRS rating input
- [ ] Session summary with strengths, expansion metrics, and queue health
- [ ] /setup command for native/target language selection
- [ ] Multi-language support (LLM-driven, no per-language code)
- [ ] Docker Compose deployment with PostgreSQL

### Out of Scope

- Audio/pronunciation features — text-only v1
- Public bot deployment — personal/private server only
- Web dashboard or mobile app — Discord-only interface
- Per-language grammar handlers — LLM handles all language parsing

## Context

- Bot persona: natural conversation partner — correction-light, flow-focused
- Skill profile: inferred implicitly over time (starts at beginner)
- Sessions are manual-only (/summary or /end) — no auto-expiry
- Correction budget: max two major errors corrected per message
- Code-switching auto-extracts native terms into FSRS bank as new items

## Constraints

- **Hosting**: Docker Compose orchestration
- **Database**: PostgreSQL with Prisma ORM
- **AI Models**: High-tier (GPT-4o/Claude 3.5 Sonnet) for conversation, low-tier (GPT-4o-mini/Gemini 1.5 Flash) for extraction
- **Interface**: Discord slash commands via discord.js
- **SRS Algorithm**: ts-fsrs (Free Spaced Repetition Scheduler)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| LLM handles all language parsing | Avoids per-language maintenance burden | — Pending |
| Implicit skill profiling | No friction onboarding, adapts naturally | — Pending |
| Manual session management | User controls practice pacing | — Pending |
| Prisma ORM | Mature DX, good migration tooling | — Pending |

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
*Last updated: 2026-07-07 after initialization*
