# Roadmap: Language Partner Bot

## Overview

An AI-driven language learning Discord bot that combines freeform conversational practice with spaced repetition. This roadmap delivers v1: a working bot that users can converse with in their target language, receive contextual corrections, build a vocabulary bank via background extraction, review cards with FSRS scheduling, and see session summaries — all through Discord slash commands. The journey progresses from foundation (bot skeleton + database) through conversation (core experience) and SRS (retention engine) to completion (actionable insights).

## Phases

- [x] **Phase 1: Foundation & Setup** - Discord bot skeleton, PostgreSQL database, Docker Compose deployment, and /setup command for language configuration
- [ ] **Phase 2: AI Conversation** - Natural target-language conversation sessions with LLM-powered responses and contextual corrections
- [ ] **Phase 3: FSRS Spaced Repetition Bank** - Vocabulary and grammar item management with ts-fsrs scheduling engine
- [ ] **Phase 4: Extraction & Review** - Background extraction pipeline and structured SRS review flow
- [ ] **Phase 5: Session Summary** - Post-session insights, strengths, expansion metrics, and queue health

## Phase Details

### Phase 1: Foundation & Setup
**Goal**: Bot connects to Discord, accepts slash commands, persists user configuration, and deploys via Docker Compose
**Mode**: mvp
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, INFRA-01, INFRA-02, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. User can run /setup to select native and target language, and the choice is stored
  2. User settings persist across bot restarts (verified by restarting container and re-checking)
  3. First-time user running /new is prompted through /setup before proceeding
  4. Docker Compose starts all services (bot, PostgreSQL, Redis) with a single command
   5. All slash commands respond within 3 seconds using deferReply() pattern
**Plans**: 1 plan
Plans:
- [x] 01-01-PLAN.md — Walking Skeleton (verified: Discord commands, Docker Compose, graceful shutdown)

### Phase 2: AI Conversation
**Goal**: Users can hold natural target-language conversations with the bot, receiving contextual corrections without breaking conversational flow
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: SETUP-04, CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06, CONV-07, CONV-08, INFRA-03
**Success Criteria** (what must be TRUE):
  1. User can start a session with /new and receive a target-language greeting matching their skill profile
  2. User sends messages in the target language and the bot responds naturally with corrections shown in a separate embed block
  3. Corrections are capped at max 2 major errors per message (user sees no more than 2 regardless of actual errors)
  4. Session survives bot restart — state rehydrates from PostgreSQL and conversation can resume
  5. Session context summarizes after 20 turns to control costs; only /summary or /end closes a session
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Core conversation loop: /new, message handler, GPT-4o-mini responses with corrections
- [ ] 02-02-PLAN.md — Session lifecycle: /end, /summary, summarization, rehydration, graceful shutdown

### Phase 3: FSRS Spaced Repetition Bank
**Goal**: Vocabulary and grammar items are stored with complete FSRS scheduling fields and managed by the ts-fsrs algorithm
**Mode**: mvp
**Depends on**: Phase 1
**Requirements**: FSRS-01, FSRS-02, FSRS-03, FSRS-04, FSRS-05
**Success Criteria** (what must be TRUE):
  1. Vocabulary items and grammar pattern items can be created with full FSRS fields (stability, difficulty, state, due, elapsed_days, scheduled_days, reps, lapses)
  2. ts-fsrs algorithm correctly updates card scheduling when a rating (Again/Hard/Good/Easy) is submitted
  3. New users start with seeded population parameters so first reviews produce sensible intervals (not zero/default values)
  4. Review intervals for items under 3 months old are capped at 14 days maximum
**Plans**: TBD

### Phase 4: Extraction & Review
**Goal**: Conversation content is automatically extracted into FSRS cards via background pipeline; users can review due cards with structured prompts and FSRS rating
**Mode**: mvp
**Depends on**: Phases 2, 3
**Requirements**: EXTR-01, EXTR-02, EXTR-03, EXTR-04, EXTR-05, EXTR-06, REVW-01, REVW-02, REVW-03, REVW-04, REVW-05
**Success Criteria** (what must be TRUE):
  1. New FSRS cards are created automatically from conversation messages via a background low-tier LLM extraction pipeline (BullMQ/Redis)
  2. Code-switching is detected: when the user types a native-language term in target-language chat, it is auto-extracted as a new FSRS item
  3. User can run /review and see due cards with three prompt types (use-in-sentence, fill-in-blank, native-translation)
  4. User can rate each card on the FSRS scale (Again=0, Hard=1, Good=2, Easy=3) and the next review date updates immediately
  5. Review flow continues presenting cards until the queue is empty or the user exits via button
**Plans**: TBD

### Phase 5: Session Summary
**Goal**: Users get actionable post-session insights including top strengths, vocabulary expansion metrics, and review queue health
**Mode**: mvp
**Depends on**: Phases 2, 4
**Requirements**: SUMM-01, SUMM-02, SUMM-03, SUMM-04, SUMM-05
**Success Criteria** (what must be TRUE):
  1. User runs /summary and the session terminates with a summary embed displayed in Discord
  2. Summary embed shows top 3 strengths — items rated Easy or that the user handled well during the session
  3. Summary embed shows expansion metrics — count of new items auto-extracted during the session
  4. Summary embed shows queue health — number of items due for review in the next 24 hours
  5. Summary persists to PostgreSQL so user can retrieve historical session data later
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Setup | 1/1 | ✓ Complete | 2026-07-07 |
| 2. AI Conversation | 0/2 | ◆ In Progress | - |
| 3. FSRS Spaced Repetition Bank | TBD | Not started | - |
| 4. Extraction & Review | TBD | Not started | - |
| 5. Session Summary | TBD | Not started | - |
