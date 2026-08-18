# Feature Landscape

**Domain:** AI Language Learning (Discord Bot)
**Researched:** 2026-07-07
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. Every major competitor (Duolingo Max, Babbel, Speak, Langua, Memrise Discord, Univext, LingChat, Mivoko) provides these.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| AI conversational practice | The core reason users install a language bot — they want to chat naturally in their target language | HIGH | Requires LLM orchestration: context management, level calibration, persona definition |
| Real-time grammar correction | Users expect the bot to catch and explain mistakes during conversation, not after | MEDIUM | Correction style (gentle vs explicit) is a UX choice; explain-mistake is table stakes |
| Vocabulary/SRS system | Every modern language app has spaced repetition; users expect words from chat to be reviewable | MEDIUM | Must persist vocabulary items per user with scheduling state; SM-2 or FSRS |
| Level adaptation | Users expect content to match their CEFR level (A1-C2); bot should adjust vocabulary/speed | HIGH | Must infer level from chat; initial config or implicit profiling |
| Multi-language support | Users pick their target language; bot must handle any language without per-language code | MEDIUM | LLM-driven — no language-specific handlers; tested competitors support 10-50+ languages |
| /setup command | Users must configure native and target language before first session | LOW | Standard Discord slash command pattern |
| Session history | Users expect to see past conversations and review what they learned | MEDIUM | Requires message storage per session; retrieval for display |
| Progress tracking | Users want to see stats: words learned, sessions completed, level progression | MEDIUM | Dashboard-style stats: vocabulary count, streak, recent accuracy |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable. These are where competitive advantage lives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Correction budget** (max 2 corrections/message) | Keeps conversation flowing — doesn't overwhelm the learner. Unique among competitors who correct everything | LOW | Prompt-level constraint; rare in the market (most bots correct every error) |
| **Background extraction pipeline** | Automatically logs vocabulary from chat without user effort. No other Discord bot seems to do this end-to-end | HIGH | Background LLM call after each session to extract item performance; pipeline design for reliability |
| **FSRS (Free Spaced Repetition Scheduler)** | More accurate scheduling than legacy SM-2; open-source implementation (ts-fsrs) | LOW | Drop-in replacement for SM-2; use ts-fsrs npm package; mathematically superior |
| **Code-switching auto-extraction** | When user types in native language, auto-add target translation to SRS. Unique DX | MEDIUM | LLM detects code-switch, generates target-language equivalent, adds to review queue |
| **Bilingual persona (correction-light, flow-focused)** | Bot prioritizes conversation over teaching; corrections are background noise, not foreground. Inverts the tutor-paradigm | MEDIUM | System prompt design; counters the "correction fatigue" problem in most AI tutors |
| **Implicit skill profiling** | No onboarding quiz — bot infers level from first few messages. Less friction than Duolingo/Babbel placement | MEDIUM | Analyze message complexity, error rate, vocabulary range to assign CEFR tier |
| **Manual session management** | User controls when sessions start/end. No auto-expiry. Simpler than scheduling-centric apps | LOW | /summary or /end command; no session timeout logic |
| **Session summary (strengths, expansion metrics, queue health)** | Post-session report with what user did well, what vocab expanded, how SRS queue looks | MEDIUM | LLM-generated summary + SRS state + correction stats |
| **SRS review within Discord** | Users review due cards without leaving Discord. No external app needed | MEDIUM | Thread-based review flow with FSRS rating input; or embed-based |
| **Docker Compose self-hosting** | User controls own data, API keys, costs. Appeals to privacy-conscious learners | LOW | Infrastructure differentiator — most competitors are SaaS-only |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this specific project.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Hearts/energy system (Duolingo-style) | Users expect limits to encourage focused practice | Penalizes learning from mistakes; creates artificial scarcity in a bot meant for unlimited practice | Correction budget (max 2 corrections/message) instead of access limits |
| Leaderboards and competitions | Users want social motivation and comparison | Requires community scale to work; creates perverse incentives (spam for XP); anti-Duolingo = no gamification | Personal session summaries; self-competition ("beat your last session") |
| Full gamification (streaks, XP, crowns, levels) | Proven engagement driver (Duolingo) | Can create anxiety-driven usage; distracts from actual learning; the project explicitly positions as anti-gamification | Progress tracking (vocab count, sessions, accuracy) as data, not game |
| Public bot deployment | Users want convenience of inviting a hosted bot | Operational cost, moderation liability, uptime SLA — out of scope per PROJECT.md | Docker Compose self-hosting; keep it private-server only |
| Web dashboard or mobile app | Users want cross-platform access to stats and vocab review | Doubles surface area; requires frontend development; Discord-only keeps scope contained | All interaction via Discord; if needed later, add as separate milestone |
| Audio/pronunciation feedback | Users want to practice speaking, not just writing | Text-to-speech and speech recognition add significant complexity; LLM latency compounds; v1 is text-only | Save for a later milestone if validated |
| Per-language grammar handlers | Users expect language-specific rules (e.g. gendered nouns in French, cases in German) | Maintenance burden grows with each language; defeats the LLM-driven approach | LLM handles all parsing; prompt-engineering for language awareness |
| Real-time voice chat | Users want live speaking practice | Requires low-latency voice pipeline; high infra cost; text-only v1 | Stick to text; voice is a v2 consideration |

## Feature Dependencies

```
/setup (native/target language)
    └──requires──> Discord bot registered with commands

AI Conversation Session
    └──requires──> /setup (language config)
    └──requires──> LLM provider integration
    └──requires──> Correction budget logic (prompt-level)
    └──enhances──> Skill profiling (implicit level detection)

Background Extraction Pipeline
    └──requires──> AI Conversation Session (source of chat data)
    └──requires──> LLM provider integration (extraction model)
    └──requires──> Session boundaries (/summary or /end)

FSRS Vocabulary Bank
    └──requires──> Background Extraction Pipeline (source of items)
    └──requires──> PostgreSQL database (vocabulary table)
    └──requires──> ts-fsrs library (scheduling algorithm)

SRS Review Flow
    └──requires──> FSRS Vocabulary Bank (due cards)
    └──requires──> Discord interaction handling (buttons/selects)

Code-Switching Auto-Extraction
    └──requires──> Background Extraction Pipeline (detection pass)
    └──requires──> FSRS Vocabulary Bank (insertion)

Session Summary
    └──requires──> AI Conversation Session (stats)
    └──requires──> FSRS Vocabulary Bank (queue health)
    └──requires──> Background Extraction Pipeline (metrics)

Skill Profiling
    └──enhances──> AI Conversation Session (level-adaptive prompting)
    └──enhances──> Session Summary (level progression)

Implicit Profiling
    └──requires──> AI Conversation Session (first few messages to analyze)
```

### Dependency Notes

- **Background Extraction Pipeline is the critical dependency bridge** — it converts raw conversation into structured vocabulary data that feeds the SRS system. Without it, the FSRS bank has no items. This is the highest-risk feature because it involves async post-processing that must not block the conversation flow.
- **FSRS Vocabulary Bank requires PostgreSQL** because FSRS scheduling state per word per user needs transactional storage. In-memory solutions lose state on restart.
- **Skill profiling enhances conversation quality** but is not required for MVP — the bot can start all users at beginner and adapt manually via /level. This can be deferred.
- **Code-switching auto-extraction** is the most unique differentiator but requires reliable language detection. If the LLM misidentifies code-switches, it creates noise in the SRS bank. Mitigation: only extract when confidence is high, and allow users to dismiss extracted items.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept. Based on the project's validated requirements.

- [/] **/setup command** — native/target language selection; gateway to all other features
- [/] **AI Conversation Session** — natural conversation with correction budget; the core experience
- [/] **Manual session management** — /summary or /end commands; simpler than auto-expiry
- [/] **Background Extraction Pipeline** — logs vocabulary performance from chat to FSRS bank
- [/] **FSRS Vocabulary Bank** — spaced repetition with ts-fsrs; persistence in PostgreSQL
- [/] **SRS Review Flow** — structured review with prompt types and FSRS rating input
- [/] **Session Summary** — strengths, expansion metrics, and SRS queue health
- [/] **Multi-language support** — LLM-driven, no per-language code

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Implicit skill profiling** — infer level from early messages instead of manual config
- [ ] **Code-switching auto-extraction** — detect native-language words in target-language chat, auto-add to SRS
- [ ] **Proactive review reminders** — notify user when SRS cards are due (opt-in)
- [ ] **Correction style toggle** — let user choose "gentle" vs "explicit" correction mode

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Voice input / pronunciation** — STT for speaking practice, requires significant infra
- [ ] **Web dashboard** — only if users demonstrably need stats outside Discord
- [ ] **Competition/leaderboards** — only if community forms around the bot
- [ ] **Audio TTS for target language** — ElevenLabs-style voice responses
- [ ] **Public bot hosting** — operational cost, only if demand justifies it

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| /setup command | HIGH | LOW | P1 |
| AI Conversation Session | HIGH | HIGH | P1 |
| Manual session management | MEDIUM | LOW | P1 |
| Correction budget | HIGH | LOW | P1 |
| Background Extraction Pipeline | HIGH | HIGH | P1 |
| FSRS Vocabulary Bank | HIGH | MEDIUM | P1 |
| SRS Review Flow | HIGH | MEDIUM | P1 |
| Session Summary | MEDIUM | MEDIUM | P1 |
| Multi-language support | HIGH | MEDIUM | P1 |
| Implicit skill profiling | MEDIUM | MEDIUM | P2 |
| Code-switching auto-extraction | MEDIUM | MEDIUM | P2 |
| Correction style toggle | LOW | LOW | P2 |
| Proactive review reminders | MEDIUM | MEDIUM | P2 |
| Voice input / pronunciation | HIGH | VERY HIGH | P3 |
| Web dashboard | MEDIUM | HIGH | P3 |
| Leaderboards | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Duolingo Max | Babbel | Speak | Mivoko | Our Bot (planned) |
|---------|--------------|--------|-------|--------|-------------------|
| AI conversation practice | Roleplay mode (Max tier only) | AI chat (limited, script-guided) | Core experience (voice-first) | Core experience (chat-first) | Core experience (text-first) |
| Grammar correction | Explain My Mistake (tapping) | In-lesson explanations | Real-time during conversation | Structured feedback in payload | Correction budget (max 2/message) |
| Spaced repetition | Internal SRS (vocab) | Spaced repetition engine | Not primary | Deterministic SRS | FSRS (ts-fsrs) |
| Auto-extraction from chat | No | No | No (manually save) | Not explicit | Background pipeline |
| Code-switching handling | No | No | No | No | Auto-extract native → target |
| Level adaptation | Unit-based (fixed progression) | Course-based (fixed progression) | Adaptive in conversation | Adaptive language mix | Implicit profiling (planned) |
| SRS review method | In-app lessons | In-app review section | Not present | Review chat mode | Discord thread/embed |
| Session summary | Streak/XP recap | Lesson complete screen | Fluency score | Not explicit | Strengths + queue health |
| Gamification | Heavy (streaks, leagues, XP) | Light | Minimal | Minimal | None (anti-gamification) |
| Voice/pronunciation | Limited (Max tier) | Speech recognition | Core (voice-first) | Roadmap | Out of scope (v1 text-only) |
| Platforms | iOS, Android, Web | iOS, Android, Web | iOS, Android | Web, iOS | Discord only |
| Self-hosted | No | No | No | No | Yes (Docker Compose) |
| Personal/private server | No | No | No | No | Yes (project constraint) |

### Key Competitive Insights

1. **No existing Discord bot does correction budget + background SRS extraction end-to-end.** Memrise Discord has solo chat, LanguaTalk has full-featured conversation but is a web app, not Discord. The combination of lightweight corrections + automatic vocabulary banking in Discord is unique.

2. **FSRS adoption is the smart technical bet.** Everyone uses SM-2 (Anki legacy). Using ts-fsrs (the modern Free Spaced Repetition Scheduler) gives better scheduling accuracy with same implementation effort.

3. **The anti-gamification stance is a genuine differentiator for adult learners.** Reviewers consistently note that Duolingo-style gamification creates anxiety and rewards recognition over production. Positioning as "no streaks, no hearts, just conversation and data" appeals to serious learners.

4. **Implicit profiling is the hard problem.** All competitors either ask for your level explicitly (Duolingo unit test, Babbel placement) or start everyone at the same point. Inferring level from freeform chat without explicit testing is an open challenge. This feature should be P2, not P1 — start all users at beginner and let them self-adjust.

5. **The pipeline architecture (async extraction after session) is the primary technical risk.** If extraction blocks the conversation, UX degrades. If extraction fails silently, SRS queue goes empty. This needs careful queue management and error handling.

## Sources

- Duolingo Max (2026) — Duolingo Max tier features (roleplay, Explain My Mistake, video calls)
- Babbel (2026) — Babbel Self-Study app features (AI chat, grammar guides, spaced repetition)
- Speak app — voice-first AI conversation platform
- Mivoko — chat-first AI language learning with deterministic SRS
- Memrise Discord App — `/learn solo`, `/learn together`, leaderboards
- LanguaTalk — AI language coaching with call mode, feedback reports, SRS flashcards
- Univext — AI tutor with adaptive conversations
- LingChat — real-time AI conversations, pronunciation feedback
- OpenLingo (open-source) — AI tutor with tools (readMemory, addMemory, SRS, exercises)
- spyrae/lingo (open-source Telegram bot) — SM-2 flashcards, AI practice, gamification
- adaptive_lang_study_bot (open-source Telegram bot) — FSRS, three session styles, proactive notifications
- Rosetta Discord Bot — real-time corrections during peer chat
- Hablemos (open-source Discord bot) — AI conversations, Language League, vocabulary tools
- Lingo Practice — AI tutor + SRS vocabulary deck
- Allomorpheus — Anki-exportable vocabulary, SRS, adaptive grammar lessons
- Migaku — sentence mining from video content + Anki-style SRS
- Various competitor reviews and comparison articles (2026)

---
*Feature research for: AI Language Learning Discord Bot*
*Researched: 2026-07-07*
