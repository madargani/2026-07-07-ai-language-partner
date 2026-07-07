# Requirements: Language Partner Bot

**Defined:** 2026-07-07
**Core Value:** Users can practice a language through natural conversation, with corrections and spaced repetition working in the background to optimize retention — without breaking conversational flow.

## v1 Requirements

### Setup & User Management

- [ ] **SETUP-01**: User can run /setup to select native and target language
- [ ] **SETUP-02**: User settings persist across bot restarts via PostgreSQL
- [ ] **SETUP-03**: First-time /new triggers /setup if not configured
- [ ] **SETUP-04**: Skill profile is inferred implicitly over time (starts at beginner)

### Conversation Sessions

- [ ] **CONV-01**: User can start a session with /new [session_name]
- [ ] **CONV-02**: Bot dispatches a target-language greeting matching skill profile
- [ ] **CONV-03**: User replies via chat, bot responds with natural conversation
- [ ] **CONV-04**: Correction budget enforces max 2 major errors corrected per message
- [ ] **CONV-05**: Correction block is appended to the Discord embed (separate from response)
- [x] **CONV-06**: Session context is summarized after 20 turns to control costs
- [x] **CONV-07**: Only /summary or /end closes a session (no auto-expiry)
- [x] **CONV-08**: Session state persists to PostgreSQL and rehydrates on restart

### FSRS Spaced Repetition Bank

- [ ] **FSRS-01**: Vocabulary items stored with FSRS fields (stability, difficulty, state, etc.)
- [ ] **FSRS-02**: Grammar pattern items stored with same FSRS fields
- [ ] **FSRS-03**: ts-fsrs algorithm updates scheduling on each review
- [ ] **FSRS-04**: Cold start handled with population parameter seeding
- [ ] **FSRS-05**: Review intervals capped at 14 days for first 3 months per item

### Background Extraction Pipeline

- [ ] **EXTR-01**: User input is passed to low-tier LLM (GPT-4o-mini/Gemini Flash) concurrently with conversation
- [ ] **EXTR-02**: Extraction output conforms to Zod schema (detectedItems, typosIgnored)
- [ ] **EXTR-03**: Semantic filtering distinguishes cognitive mistakes from mechanical typos
- [ ] **EXTR-04**: Code-switching detection auto-extracts native terms and injects as New items
- [ ] **EXTR-05**: Extracted items update FSRS metrics in PostgreSQL
- [ ] **EXTR-06**: Extraction pipeline runs via BullMQ/Redis for backpressure management

### Structured Review

- [ ] **REVW-01**: User can run /review to fetch items where nextReview <= now
- [ ] **REVW-02**: Review prompts include: use-in-sentence, fill-in-blank, and native-translation types
- [ ] **REVW-03**: User response rated on FSRS scale (Again=0, Hard=1, Good=2, Easy=3)
- [ ] **REVW-04**: Rating feeds into ts-fsrs scheduler and updates next review date
- [ ] **REVW-05**: Review flow recurses until queue is clear or user exits via button

### Session Summary

- [ ] **SUMM-01**: /summary terminates session and aggregates session data
- [ ] **SUMM-02**: Embed displays top 3 strengths (items rated Easy during session)
- [ ] **SUMM-03**: Embed displays expansion metrics (new items auto-extracted)
- [ ] **SUMM-04**: Embed displays queue health (items due for review in next 24h)
- [ ] **SUMM-05**: Summary persists to PostgreSQL for historical tracking

### Infrastructure & Deployment

- [ ] **INFRA-01**: Application runs in Docker Compose (bot, PostgreSQL, Redis)
- [ ] **INFRA-02**: Prisma ORM manages PostgreSQL schema and migrations
- [ ] **INFRA-03**: LLM provider routing: high-tier for conversation, low-tier for extraction
- [ ] **INFRA-04**: All slash commands use deferReply() to handle the 3-second Discord timeout
- [ ] **INFRA-05**: Graceful shutdown saves in-memory session state to PostgreSQL

## v2 Requirements

### Advanced Features

- **PROF-01**: Implicit CEFR profiling adjusts difficulty dynamically
- **PROF-02**: Proactive review reminders based on queue health
- **AUDIO-01**: TTS for bot responses
- **AUDIO-02**: Speech-to-text for user pronunciation practice
- **ANALYTICS-01**: Web dashboard for progress visualization

## Out of Scope

| Feature | Reason |
|---------|--------|
| Audio/pronunciation features | Text-only v1, audio deferred to v2 |
| Public bot deployment | Personal/private server only; multi-server infra not needed |
| Web dashboard | Discord-only interface; dashboard deferred to v2 |
| Per-language grammar handlers | LLM handles all language parsing generically |
| Gamification (streaks, XP) | Anti-Duolingo positioning; targets serious adult learners |
| OAuth / social login | Discord ID is the sole identity provider |
| Mobile app | No mobile client; Discord is the full interface |
| Real-time collaborative practice | No peer-to-peer or multi-user sessions |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Pending |
| SETUP-02 | Phase 1 | Pending |
| SETUP-03 | Phase 1 | Pending |
| SETUP-04 | Phase 2 | Pending |
| CONV-01 | Phase 2 | Pending |
| CONV-02 | Phase 2 | Pending |
| CONV-03 | Phase 2 | Pending |
| CONV-04 | Phase 2 | Pending |
| CONV-05 | Phase 2 | Pending |
| CONV-06 | Phase 2 | Complete |
| CONV-07 | Phase 2 | Complete |
| CONV-08 | Phase 2 | Complete |
| FSRS-01 | Phase 3 | Pending |
| FSRS-02 | Phase 3 | Pending |
| FSRS-03 | Phase 3 | Pending |
| FSRS-04 | Phase 3 | Pending |
| FSRS-05 | Phase 3 | Pending |
| EXTR-01 | Phase 4 | Pending |
| EXTR-02 | Phase 4 | Pending |
| EXTR-03 | Phase 4 | Pending |
| EXTR-04 | Phase 4 | Pending |
| EXTR-05 | Phase 4 | Pending |
| EXTR-06 | Phase 4 | Pending |
| REVW-01 | Phase 4 | Pending |
| REVW-02 | Phase 4 | Pending |
| REVW-03 | Phase 4 | Pending |
| REVW-04 | Phase 4 | Pending |
| REVW-05 | Phase 4 | Pending |
| SUMM-01 | Phase 5 | Pending |
| SUMM-02 | Phase 5 | Pending |
| SUMM-03 | Phase 5 | Pending |
| SUMM-04 | Phase 5 | Pending |
| SUMM-05 | Phase 5 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 2 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |

**Coverage:**

- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✅

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 after initial definition*
