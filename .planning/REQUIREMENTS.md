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
- [ ] **CONV-06**: Session context is summarized after 20 turns to control costs
- [ ] **CONV-07**: Only /summary or /end closes a session (no auto-expiry)
- [ ] **CONV-08**: Session state persists to PostgreSQL and rehydrates on restart

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
| SETUP-01 | TBD | Pending |
| SETUP-02 | TBD | Pending |
| SETUP-03 | TBD | Pending |
| SETUP-04 | TBD | Pending |
| CONV-01 | TBD | Pending |
| CONV-02 | TBD | Pending |
| CONV-03 | TBD | Pending |
| CONV-04 | TBD | Pending |
| CONV-05 | TBD | Pending |
| CONV-06 | TBD | Pending |
| CONV-07 | TBD | Pending |
| CONV-08 | TBD | Pending |
| FSRS-01 | TBD | Pending |
| FSRS-02 | TBD | Pending |
| FSRS-03 | TBD | Pending |
| FSRS-04 | TBD | Pending |
| FSRS-05 | TBD | Pending |
| EXTR-01 | TBD | Pending |
| EXTR-02 | TBD | Pending |
| EXTR-03 | TBD | Pending |
| EXTR-04 | TBD | Pending |
| EXTR-05 | TBD | Pending |
| EXTR-06 | TBD | Pending |
| REVW-01 | TBD | Pending |
| REVW-02 | TBD | Pending |
| REVW-03 | TBD | Pending |
| REVW-04 | TBD | Pending |
| REVW-05 | TBD | Pending |
| SUMM-01 | TBD | Pending |
| SUMM-02 | TBD | Pending |
| SUMM-03 | TBD | Pending |
| SUMM-04 | TBD | Pending |
| SUMM-05 | TBD | Pending |
| INFRA-01 | TBD | Pending |
| INFRA-02 | TBD | Pending |
| INFRA-03 | TBD | Pending |
| INFRA-04 | TBD | Pending |
| INFRA-05 | TBD | Pending |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 0
- Unmapped: 37 ⚠️

---
*Requirements defined: 2026-07-07*
*Last updated: 2026-07-07 after initial definition*
