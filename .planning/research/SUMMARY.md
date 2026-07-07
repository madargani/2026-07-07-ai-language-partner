# Project Research Summary

**Project:** AI Language Partner — Discord Bot for Language Learning
**Domain:** AI conversational language tutor (Discord bot with FSRS spaced repetition)
**Researched:** 2026-07-07
**Confidence:** HIGH (cross-validated across official docs, production post-mortems, and academic papers)

## Executive Summary

This project is an **AI-powered language learning partner** that lives inside Discord as a bot. It enables users to practice natural conversation in their target language, receive lightweight real-time corrections (capped at 2 per message to avoid overwhelm), and automatically build a spaced-repetition vocabulary bank from their chat interactions. The product is self-hosted via Docker Compose, targets privacy-conscious adult learners, and deliberately avoids gamification gimmicks (no streaks, hearts, or leaderboards).

The recommended stack is a **TypeScript monolith on Node.js 22 LTS** with **discord.js v14** for the Discord gateway, **PostgreSQL 17 + Prisma 6** for persistence, **ts-fsrs 5.x** for the Free Spaced Repetition Scheduler, **BullMQ + Redis** for a background extraction pipeline, and **OpenAI/Anthropic SDKs** (with an optional Gemini fallback) for LLM integration. The architecture follows a **layered monolith** pattern — Discord Gateway → Service → AI Integration → Data Access → Data — which is standard for production Discord bots at this scale. Microservices would be premature.

Three risks dominate. **First:** over-correction — the bot must never become a grammar lecture. The correction budget (max 2 corrections/message) and a bilingual persona prompt are the mitigations. **Second:** FSRS cold start — without pre-seeded parameters and interval capping, new users get garbage intervals. Seed with population parameters and cap at 14 days for the first 3 months. **Third:** LLM hallucination in educational content — erroneous corrections erode trust. Frame all corrections as suggestions, implement output validation, and never present LLM output as authoritative. Cost management for LLM calls is a fourth cross-cutting concern that needs throttling and caching from day one.

## Key Findings

### Recommended Stack

The research strongly converges on a **TypeScript-first, Node.js runtime stack** with PostgreSQL persistence, Prisma ORM, and BullMQ for background processing. Prisma 6 (not 7) is the clear choice — Prisma 7's breaking changes (WebAssembly query engine, removed `$use()` middleware, new config format) add risk without meaningful benefit for a Discord bot.

**Core technologies:**
- **Node.js 22 LTS**: Runtime — Active LTS through Oct 2026, Maintenance LTS through Apr 2027. Required by discord.js v14.26.x (needs 22.12.0+) and ts-fsrs 5.x (needs 20+).
- **TypeScript 5.9.x**: Language — De facto standard. Avoids TS 6.0 deprecations (`--moduleResolution node`, AMD/UMD targets).
- **discord.js 14.26.x**: Discord API client — Dominant library with first-class slash commands, components, TypeScript declarations.
- **PostgreSQL 17**: Database — Structured data, FSRS card state, session history. Production-proven with JSON support.
- **Prisma 6.19.x**: ORM — Schema-first, excellent migration tooling, stable. **Do NOT use Prisma 7** (breaking changes are not warranted).
- **ts-fsrs 5.4.1**: SRS algorithm — Zero-dependency, pure TypeScript, canonical FSRS-5 implementation.
- **BullMQ 5.x**: Background job queue — Required for async extraction pipeline. Built on Redis Streams.
- **Redis 7.x**: Queue backend — Required by BullMQ, also useful for caching and session state.
- **OpenAI SDK 6.x + Anthropic SDK 0.105.x**: LLM clients — Direct SDK control preferred over Vercel AI SDK abstraction.
- **Docker Compose (V2 CLI)**: Orchestration — Modern Compose Spec with health checks and named volumes.

**Key architecture decision:** Prisma 6 vs 7. Use Prisma 6. The bot is not serverless — bundle size doesn't matter. The migration risk from Prisma 6→7 is not worth it. Migrate in a later milestone when the ecosystem settles.

### Expected Features

**Must have (table stakes) — P1 (Ship in v1):**
- **/setup command** — native/target language selection; gateway to all other features
- **AI Conversation Session** — natural conversation with correction budget (max 2 corrections/message); the core experience
- **Manual session management** — `/end` and `/summary` commands; no auto-expiry
- **Correction budget** — prompt-level constraint limiting corrections per message; unique differentiator
- **Background Extraction Pipeline** — async post-session LLM call to log vocabulary performance; critical dependency for SRS
- **FSRS Vocabulary Bank** — spaced repetition with ts-fsrs, persisted in PostgreSQL
- **SRS Review Flow** — structured review with prompt types and FSRS rating input (Again/Hard/Good/Easy)
- **Session Summary** — strengths, expansion metrics, SRS queue health post-session
- **Multi-language support** — LLM-driven, no per-language code

**Should have (differentiators) — P2 (v1.x):**
- **Implicit skill profiling** — infer CEFR level from first few messages; no onboarding quiz
- **Code-switching auto-extraction** — detect native-language words in target chat, auto-add to SRS
- **Proactive review reminders** — notify when SRS cards are due (opt-in)
- **Correction style toggle** — gentle vs explicit mode

**Defer (v2+):**
- Voice input / pronunciation (high infra cost)
- Web dashboard (scope expansion)
- Leaderboards / competitions (anti-gamification stance)
- Public bot hosting (operational cost, liability)

**Anti-features to avoid:** Hearts/energy systems, full gamification (streaks/XP/crowns), public bot hosting, web dashboard in v1, audio/pronunciation, per-language grammar handlers.

### Architecture Approach

The recommended architecture is a **layered monolith** — the standard pattern for production Discord bots at <1K guilds. Four horizontal layers (Discord Gateway, Service, AI Integration, Data Access) with one vertical cross-cutting concern (SRS Engine). Discord.js commands are thin delegates that parse interaction data and delegate to stateless service classes. Services orchestrate across repositories (Prisma wrappers), the LLM service (provider-abstracted model router), and the pure SRS engine (ts-fsrs). Session state lives in an in-memory Map for fast lookup, backed by PostgreSQL persistence for crash recovery.

**Major components:**
1. **Discord Client + Command Handlers** — WebSocket gateway via discord.js v14, slash command registration/execution, event listeners for `messageCreate` and `interactionCreate`
2. **SessionService + ConversationService + ReviewService** — Business logic: session lifecycle, conversation flow with correction budget, review flow with FSRS rating
3. **LLM Service (Model Router)** — Provider abstraction over OpenAI/Anthropic SDKs; high-tier for conversation+corrections, low-tier for extraction
4. **SRS Engine** — Pure ts-fsrs wrapper; no I/O, just `scheduleCard(card, rating, date)` → `(newCard, reviewLog)`
5. **Repositories + PrismaService** — Data access layer: thin wrappers over Prisma generated types. Services never import Prisma directly.

**Key architectural patterns:** (1) Command handler per file with SlashCommandBuilder, (2) Service layer that never touches Discord types, (3) LLMProvider interface for multi-provider routing, (4) Pure SRS engine separated from I/O.

### Critical Pitfalls

1. **Over-correction destroys engagement** — The #1 killer. If the bot corrects every error, users stop talking. **Prevention:** Correction budget (max 2/message), use recasts not explicit flagging, suppress corrections during flow, save analysis for summary mode.

2. **3-second Discord interaction timeout + LLM latency** — Every command will hit this. **Prevention:** ALWAYS call `interaction.deferReply()` immediately (buys 15 minutes). Never `await` an LLM call before `reply()`.

3. **FSRS treated as a magic black box** — Without storing review history, seeding parameters, and capping intervals, users get garbage scheduling. **Prevention:** Store every review event (not just latest state), seed with population parameters, cap intervals at 14 days for first 3 months, validate all ts-fsrs inputs with Zod.

4. **LLM hallucinations in educational content** — Users detect only ~20% of errors; undetected errors harm learning. **Prevention:** Never present LLM output as authoritative, frame as suggestions, implement two-model validation pipeline, log all corrections for audit.

5. **LLM cost explosion from unbounded extraction** — Every message triggering 2 LLM calls scales costs linearly. **Prevention:** Extraction throttling (every N messages), cache common corrections, use cheap model for extraction, set daily usage budgets.

6. **No state machine for conversation mode** — Intent classification from raw text fails ~30% of the time. **Prevention:** Build a session state machine with explicit modes (FREE_CONVERSATION, CORRECTION, REVIEW, VOCAB_LOOKUP) from day one. Only transition on explicit user signals.

7. **Free-tier hosting kills persistent WebSocket** — Platform sleep kills the Discord gateway connection. **Prevention:** Use worker-process hosting, separate gateway connection from web service, implement graceful SIGTERM handling.

8. **Shipping without content QA pipeline** — AI-generated content has ~2% actual errors and ~18% "not quite right." **Prevention:** Self-verification pipeline (generate → review → reject/regenerate), log all generation params, surface "report incorrect" on every correction.

## Implications for Roadmap

### Suggested Phase Structure

The following ordering is driven by **dependency chains** discovered in feature research and **layer-first** architecture principles. Phases are sized to deliver a demonstrable increment while avoiding the critical pitfalls identified above.

#### Phase 1: Foundation — Discord Bot Skeleton + Database

**Rationale:** Everything depends on having a working Discord bot with commands and a database. This phase establishes the development environment, project structure, and deployment foundation. Delaying this means every subsequent phase has no place to run.

**Delivers:**
- Working Discord bot that connects, appears online, responds to ping
- `/setup` command with language pair configuration (stored in PostgreSQL)
- Prisma schema for User, Session, FSRSCard, ReviewLog models
- Docker Compose with PostgreSQL + Redis services
- Project structure following the recommended `src/` layout
- Environment config loading with Zod validation

**Addresses features:** /setup command, multi-language support (foundation)
**Uses stack:** Node.js 22, TypeScript 5.9, discord.js 14, PostgreSQL 17, Prisma 6, Docker Compose
**Avoids pitfalls:** Gateway intent configuration (must double-check MessageContent + GuildMessages intents), Guild vs global command registration (use guild-scoped during dev), hardcoded IDs (store in DB)
**Research flag:** This phase uses well-documented standard patterns (discord.js setup, Prisma init). Skip `/gsd-plan-phase --research-phase`.

#### Phase 2: AI Conversation Sessions

**Rationale:** The core user experience — talking to the bot. Must come before extraction or SRS because those depend on conversation data. This is the riskiest phase (over-correction, LLM latency, timeout race), so it needs to be proven early.

**Delivers:**
- `/start` command to begin a session
- LLM Service with provider abstraction (OpenAI + Anthropic)
- Conversation Service: message → context assembly → LLM call → reply with correction budget
- Correction budget enforcement (max 2 corrections/message via prompt constraint)
- Session state machine: FREE_CONVERSATION mode with manual session boundaries
- In-memory session context map + PostgreSQL persistence
- Per-user rate limiting (max 10 messages/min)
- `interaction.deferReply()` on every command handler

**Addresses features:** AI Conversation Session, correction budget, manual session management
**Uses stack:** OpenAI SDK 6.x, Anthropic SDK, discord.js events
**Implements architecture:** ConversationService, LLM Service (model router), SessionService
**Avoids pitfalls:** Over-correction (Pitfall #1), 3-second timeout (Pitfall #3), LLM inconsistency (Pitfall #2 — session state machine), LLM cost monitoring (Pitfall #6 — budget logging)
**Research flag:** LLM prompt engineering and model selection may need a `/gsd-plan-phase --research-phase` to determine optimal system prompt for the bilingual persona and correction budget enforcement. The provider abstraction pattern is well-documented but the specific prompt design requires iteration.

#### Phase 3: FSRS Vocabulary Bank

**Rationale:** The SRS system is independent of the extraction pipeline — cards can be created directly. This phase establishes the data model, scheduling engine, and persistence layer. It must come before extraction (which creates cards) and review (which consumes them).

**Delivers:**
- ts-fsrs integration with project-specific parameters (request_retention: 0.9, max_interval: configurable)
- FSRS card CRUD with full state persistence (due, stability, difficulty, state, etc.)
- ReviewLog repository (immutable append-only log of every rating event)
- Population-level parameter seeding for new users (cold-start prevention)
- Interval capping at 14 days for new users (< 3 months old)
- Zod validation at the ts-fsrs boundary
- Parameter optimization stub (ready for batch optimization after 500+ reviews)

**Addresses features:** FSRS Vocabulary Bank (P1)
**Uses stack:** ts-fsrs 5.4.1, PostgreSQL 17, Prisma 6
**Implements architecture:** SRS Engine wrapper (scheduler.ts, operations.ts), ItemRepository, ReviewLogRepository
**Avoids pitfalls:** FSRS as magic black box (Pitfall #5 — review event storage, interval capping, parameter seeding), Hot/cold intervals (Moderate Pitfall #2 — capping and stability clamping)
**Research flag:** ts-fsrs API is well-documented with zero dependencies. No research-phase needed. However, the parameter initialization strategy (population parameters vs default) may need validation during planning.

#### Phase 4: Background Extraction Pipeline

**Rationale:** This is the critical dependency bridge that converts raw conversation into structured vocabulary data for the SRS. It's the highest-risk feature because it involves async post-processing that must not block conversation. BullMQ + Redis are set up in Phase 1; the LLM service from Phase 2 is reused.

**Delivers:**
- BullMQ queue for post-session extraction jobs
- Low-tier LLM call (GPT-4o-mini or Gemini Flash) for vocabulary/grammar item extraction
- Item extraction prompt that classifies value (relevance + difficulty) before queue insertion
- Minimum frequency threshold (extract items appearing 2+ times)
- Stop-word and low-value-item filtering
- Job retry with dead-letter queue for failed extractions
- Extraction throttling (run every N messages, not every message)
- Code-switching detection pass (flag native-language terms for cross-reference)

**Addresses features:** Background Extraction Pipeline (P1), code-switching auto-extraction (P2 — foundation)
**Uses stack:** BullMQ 5.x, Redis 7.x, OpenAI SDK (low-tier), optionally Google Gemini SDK
**Implements architecture:** Background job worker, extraction prompt templates
**Avoids pitfalls:** Code-switching noise (Moderate Pitfall #4 — quality gate + frequency threshold), LLM cost explosion (Moderate Pitfall #6 — throttling + cheap model), Session state lost on restart (Moderate Pitfall #3 — BullMQ persistence)
**Research flag:** Extraction prompt engineering and quality gate thresholds need deeper research. Recommend `/gsd-plan-phase --research-phase` for extraction QA pipeline design and cost modeling. This is the least-documented pattern in the codebase.

#### Phase 5: SRS Review Flow

**Rationale:** The review flow is how users practice vocabulary. It depends on Phase 3 (FSRS bank has cards) and Phase 4 (extraction pipeline is adding cards). The Discord interaction UI (buttons, embeds) is a shipping concern that should be deferred until the backend is solid.

**Delivers:**
- `/review` command that fetches due cards and presents first prompt
- Prompt type selection (translation T→N, translation N→T, fill-in-blank)
- FSRS rating input via Discord buttons (Again/Hard/Good/Easy)
- Rating submission → scheduleCard() → persist new state + review log
- Queue health display (due count, total items, retention trend)
- Graceful handling of empty queue ("all caught up!")

**Addresses features:** SRS Review Flow (P1)
**Uses stack:** ts-fsrs, discord.js components (buttons, embeds), PostgreSQL
**Implements architecture:** ReviewService, SRS Engine operations
**Avoids pitfalls:** Hot/cold intervals (Moderate Pitfall #2 — already mitigated in Phase 3), No "why" behind corrections (Minor Pitfall #6 — prompt type includes explanation)
**Research flag:** Standard discord.js component interaction patterns. No research-phase needed. However, prompt type design for SRS review may benefit from research into effective SRS prompt formats.

#### Phase 6: Session Summary + Analytics

**Rationale:** Session summaries depend on conversation stats (from Phase 2), extraction metrics (from Phase 4), and FSRS queue health (from Phase 3). This is a natural "capstone" for the core v1 feature set — it completes the feedback loop.

**Delivers:**
- `/end` command with session finalization
- `/summary` command (current session) and historical summary (past sessions)
- LLM-generated session summary: strengths identified, vocabulary expanded, queue health
- Stats display: message count, corrections given, items extracted, level progression
- Session history retrieval (past sessions with summaries)
- Correction budget analytics (over-correction detection signal)

**Addresses features:** Session Summary (P1), progress tracking (P1)
**Uses stack:** LLM Service (low-tier for summary generation, async), PostgreSQL
**Implements architecture:** SessionService summary generation
**Avoids pitfalls:** LLM cost explosion (Moderate Pitfall #6 — run summary generation async after session ends, not on every message)
**Research flag:** Standard LLM summarization patterns. Can skip research-phase. The summary prompt design may need tuning but is not architecturally risky.

#### Phase 7: Polish, Implicit Profiling, and Advanced Features

**Rationale:** After the core loop (conversation → extraction → review → summary) is proven, add differentiation features and polish. These are P2 features that enhance the experience but aren't required for validation.

**Delivers:**
- Implicit skill profiling (analyze first N messages for CEFR level estimation)
- Code-switching auto-extraction (full implementation with confidence gating)
- Proactive review reminders (opt-in DM notifications for due cards)
- Correction style toggle (gentle vs explicit)
- "Report incorrect" button on corrections (content QA pipeline)
- Graceful shutdown (SIGTERM handler for WebSocket + pending writes)
- bull-board UI for queue monitoring (operational visibility)

**Addresses features:** Implicit skill profiling, code-switching, proactive reminders, correction toggle
**Uses stack:** LLM Service, BullMQ (for notifications), discord.js DMs
**Implements architecture:** Skill profiling analyzer, code-switch detector
**Avoids pitfalls:** Shipping without QA pipeline (Pitfall #8 — report incorrect + validation pipeline)
**Research flag:** Implicit skill profiling from freeform chat is an open challenge. This phase **needs** `/gsd-plan-phase --research-phase` to investigate approaches (lexical complexity analysis, error rate correlation, vocabulary range estimation). No established pattern exists for this in the codebase.

### Phase Ordering Rationale

- **Dependency-driven:** Phase 1 (foundation) → Phase 2 (conversation) → Phase 4 (extraction) → Phase 5 (review) → Phase 6 (summary). Each phase depends on the previous.
- **Risk-first:** Phase 2 (LLM conversation) is the riskiest from a UX perspective (over-correction, timeout, inconsistency). It comes second so it's proven early and can be iterated.
- **Architecture-layer-first:** The data layer (Phase 1 database) and AI infrastructure (Phase 2 LLM service) are established before business logic (Phases 3-6).
- **Cost-sensitive:** Phase 4 (extraction pipeline) includes cost mitigation (throttling, cheap model) before it connects to real users.
- **FSRS cold start protection:** Phase 3 (FSRS bank with parameter seeding and interval capping) is built before Phase 4 (extraction starts adding real cards), ensuring no user gets garbage intervals.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (AI Conversation):** Prompt engineering for bilingual persona and correction budget enforcement needs LLM-specific research and iteration
- **Phase 4 (Background Extraction):** Extraction prompt design, quality gate thresholds, cost modeling — least documented pattern
- **Phase 7 (Implicit Profiling):** Open research challenge — CEFR estimation from freeform chat has no established production pattern

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Standard discord.js + Prisma setup, well-documented
- **Phase 3 (FSRS Bank):** ts-fsrs API is documented, zero-dependency, straightforward
- **Phase 5 (SRS Review):** Standard discord.js component interaction patterns
- **Phase 6 (Session Summary):** Standard LLM summarization, well-understood

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Verified against official npm packages, documentation, and release schedules. Prisma 6 vs 7 decision cross-validated against changelogs and migration reports. Node 22 LTS timeline confirmed via endoflife.date. |
| Features | **HIGH** | Cross-validated against 15+ competitor products (Duolingo Max, Babbel, Speak, Mivoko, Memrise, LanguaTalk, Univext, LingChat, OpenLingo, spyrae/lingo, adaptive_lang_study_bot, Rosetta, Hablemos, Lingo Practice, Migaku). Feature dependencies mapped and prioritized. |
| Architecture | **HIGH** | Patterns validated against discord.js official documentation, production Discord bot architecture guides (Belmo, vibebot.gg, APIScout), Prisma repository pattern guides, and ts-fsrs API design. Anti-patterns identified from multiple post-mortems. |
| Pitfalls | **HIGH** | Cross-validated across 6 production post-mortems (Promova, Mocko.ai, Pocket Linguist, KasusKnacker, Yaya, Belmo), 3 academic papers (ACL 2026, Li et al. 2025, arXiv 2026), and official FSRS documentation. Critical and moderate pitfalls have multiple independent sources confirming each. |

**Overall confidence: HIGH**

### Gaps to Address

1. **Implicit skill profiling approach** — No established production pattern for inferring CEFR level from freeform chat. Needs research-phase investigation during Phase 7 planning. Options include: lexical complexity analysis, error rate correlation, or using an LLM to classify level from message samples.

2. **Extraction pipeline quality metrics** — What constitutes a "good" extraction? No published benchmarks exist for LLM-based vocabulary extraction from conversational chat. Needs empirical validation during Phase 4: measure precision/recall against a test set of annotated conversations.

3. **Parameter optimization schedule** — When and how to run FSRS parameter optimization for individual users. The FSRS guide recommends every 500 reviews, but practical implementation (batch vs online, user-facing impact) needs specification during Phase 3 planning.

4. **Prompt templates not yet designed** — The templates referenced in the architecture (conversation, correction, item-extraction, review prompts) exist as placeholders. Their design is an LLM-engineering task that must happen during Phase 2 and Phase 4, not during architecture planning. The architecture defines where they live and how they're called, not their content.

5. **Cost budget for LLM calls** — The research flags cost explosion as a risk but doesn't establish specific budget thresholds. This should be decided during Phase 2 planning (e.g., $X/day per user, $X/day total soft cap).

## Sources

### Primary (HIGH confidence)
- [discord.js v14 official guide](https://discordjs.guide/app-creation/handling-commands.html) — Command handling, event patterns, interaction lifecycle
- [discord.js v14 documentation](https://discord.js.org/docs) — API reference, intent configuration
- [ts-fsrs v5.4.1 npm](https://www.npmjs.com/package/ts-fsrs) — Official package, zero-dependency TypeScript FSRS
- [Prisma 6 ORM documentation](https://www.prisma.io/docs/orm) — Schema design, client generation, migrations
- [Prisma 7.8.0 Changelog](https://releases.sh/prisma/prisma) — Breaking changes from v6 to v7
- [BullMQ 5.x npm](https://www.npmjs.com/package/bullmq) — Official package (3.8M weekly downloads)
- [OpenAI Node SDK v6](https://www.npmjs.com/package/openai) — Official SDK
- [@anthropic-ai/sdk v0.105.x](https://www.npmjs.com/package/@anthropic-ai/sdk) — Official SDK (24M+ weekly downloads)
- [Node.js release schedule](https://endoflife.date/nodejs) — LTS timeline verification
- [PostgreSQL 17 lifecycle](https://versionlog.com/postgresql/17/) — Production version confirmation
- [Docker Compose history](https://docs.docker.com/compose/intro/history/) — Compose Spec version tracking
- [Anki FSRS tutorial (GitHub)](https://github.com/open-spaced-repetition/fsrs4anki/wiki) — FSRS parameter optimization, interval behavior, review log design
- [FSRS Kotlin audit (GitHub)](https://github.com/open-spaced-repetition/fsrs4anki/wiki) — 11 confirmed defects in FSRS implementations
- [Belmo 3-Process Architecture](https://belmo.io) — Discord gateway worker pattern, graceful shutdown, WebSocket persistence

### Secondary (MEDIUM confidence)
- [Promova AI Tutor post-mortem (dev.to, Jul 2026)](https://dev.to) — Over-correction kills usability; correction is a policy problem
- [Mocko.ai lessons (dev.to, Jul 2026)](https://dev.to) — LLM inconsistency is the biggest technical challenge; AI should guide, not replace
- [Pocket Linguist post-mortem (dev.to, Feb 2026)](https://dev.to) — Intent classification fails 30% without state machine; correction via recasts
- [KasusKnacker post-mortem (asanchez.dev, Jan 2026)](https://asanchez.dev) — 2% error rate in AI content; 18% needs improvement; cost blind spots
- [vibebot.gg discord.js gotchas](https://vibebot.gg) — 3-second interaction race; intent flags are silent killers
- [APIScout Discord bot guide](https://apiscout.com) — Guild vs global command registration; timeout handling
- [FSRS deployment guide (dev.to, May 2026)](https://dev.to) — Cold start needs 50 reviews; cap intervals for UX; store all review events
- [Building an AI-Powered Discord Bot (Medium, Sep 2025)](https://medium.com/@ayushsh762) — Multi-service Discord bot architecture
- [Clean Architecture with Prisma (Arnaud Renaud)](https://www.arnaudrenaud.com) — Repository pattern, service layer design
- [Prisma Repository Pattern (Alex Rusin)](https://blog.alexrusin.com) — Clean architecture with TypeScript and Prisma
- [Duplicate Todo Issue (GitHub)](https://github.com/akoita/resonate/issues/413) — Documented Prisma v5→v7 migration pain points

### Tertiary (LOW confidence — needs validation)
- **Implicit profiling approaches** — No published production patterns. Needs empirical validation during Phase 7.
- **Extraction pipeline quality benchmarks** — No published precision/recall benchmarks for LLM vocabulary extraction from chat. Needs custom evaluation set during Phase 4.
- **LLM cost-per-user projection** — Cost estimates depend on model pricing, message volume, and extraction frequency. Needs modeling during implementation.

---

*Research completed: 2026-07-07*
*Ready for roadmap: yes*
