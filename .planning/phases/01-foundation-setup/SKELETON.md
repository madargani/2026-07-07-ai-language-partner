# Walking Skeleton — Language Partner Bot

**Phase:** 1
**Generated:** 2026-07-07

## Capability Proven End-to-End

A language learner can run `/setup` in a Discord server, select their native and target languages from interactive dropdown menus, and have those preferences persisted to PostgreSQL — surviving bot restarts via Docker Compose.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS (node:22-alpine Docker image) | Active LTS through Oct 2026. discord.js v14 requires Node 22.12.0+. Alpine keeps image size small. |
| Language | TypeScript 5.9.x | Stable, avoids TypeScript 6.0 breaking changes (deprecated moduleResolution modes). Pin to ~5.9.0. |
| Discord API client | discord.js v14.26.x | Dominant library with TypeScript-first support. Targets Discord API v10. Guild-scoped commands for instant dev propagation. |
| Database | PostgreSQL 17 (postgres:17-alpine) | Industry standard. Supports JSON, robust indexing, excellent concurrency for multi-user bot workloads. |
| ORM | Prisma 6.19.x (pinned to ^6.19.0) | Schema-first with migration tooling, type-safe queries, singleton connection pool. Prisma 7's WASM engine and breaking middleware changes are not warranted for a non-serverless app. |
| Caching / Queue backend | Redis 7 (provisioned in Compose, unused in Phase 1) | Required for BullMQ (Phase 4). Provisioning now avoids a Docker Compose refactor later. Negligible idle cost. |
| Config validation | Zod 4.x | Runtime validation for env vars at startup. Exits with clear errors if any var is missing. |
| Test framework | Vitest 4.x | Modern TypeScript-native test runner. Fast, compatible with tsx. |
| Linting | Biome | Modern all-in-one linter/formatter. Replaces ESLint + Prettier. |
| Container orchestration | Docker Compose (split: base + dev override) | Single `docker compose up` starts all services. Split compose enables development overrides (tsx watch, bind mounts) without polluting the production config. |
| Dev hot-reload | tsx watch | TypeScript execution without compile step. Watch mode in Docker Compose dev override. |
| Graceful shutdown | process.on('SIGTERM'/'SIGINT') → destroy client → disconnect Prisma | Two-step cleanup with 10s safety timeout. IsShuttingDown flag prevents double-execution. No session save in Phase 1 (no sessions yet). |
| Health checks | pg_isready + redis-cli ping + depends_on condition: service_healthy | Prevents bot from starting before PostgreSQL/Redis are ready. Avoids crash-loop on first boot. |
| Directory layout | Feature-based under src/ (commands/, events/, lib/) | Commands as single files (SlashCommandBuilder + execute). Shared utilities in lib/. One file per command scales cleanly. |
| Language storage | ISO 639-1 string codes (not Prisma enum) | Simpler schema, no migration on language additions, easy API integration. Explicit `configured` boolean flag. |
| Gateway Intents | Guilds, GuildMessages, MessageContent | Minimum intents for slash commands and message reading (future use). Enabled in code AND Discord Developer Portal. |

## Stack Touched in Phase 1

- [x] Project scaffold (npm init, TypeScript, Biome, Vitest)
- [x] Discord bot — WebSocket connection + slash command registration
- [x] Database — PostgreSQL with Prisma ORM (User model)
- [x] One real DB read + write — /setup reads/upserts User record via prisma.user
- [x] Interactive UI — Two-step StringSelectMenu dropdown flow for /setup
- [x] Deployment — Docker Compose with bot, PostgreSQL, and Redis services
- [x] Graceful shutdown — SIGTERM/SIGINT handler
- [x] Config validation — Zod at startup

## Out of Scope (Deferred to Later Slices)

- **Skill profile fields in User model** — deferred to Phase 2 when implicit CEFR profiling is introduced. User model stays minimal in Phase 1.
- **LLM API keys in env** — deferred to Phase 2 when AI conversation is implemented. No LangChain, no .env LLM variables in Phase 1.
- **Session state management** — deferred to Phase 2 (CONV-08). Phase 1 graceful shutdown does not save/rehydrate sessions.
- **BullMQ job queue** — deferred to Phase 4. Redis container is provisioned but unused.
- **In-memory session cache** — deferred to Phase 2 when conversation state needs to persist across turns.
- **Message content processing** — Phase 1 handles only slash commands (interactions). Message content reading is configured via intents but not used until Phase 2.
- **Production hardening** — no rate limiting, no error reporting service, no logging framework beyond console. These will be added organically as the bot grows.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2: AI Conversation** — Natural language conversation sessions with LLM-powered responses, contextual corrections in embeds, session state persistence, and per-conversation message history management.
- **Phase 3: FSRS Spaced Repetition Bank** — Vocabulary and grammar item management with ts-fsrs scheduling fields, card creation, due-date calculation, and review interval capping.
- **Phase 4: Extraction & Review** — Background LLM extraction pipeline (BullMQ/Redis) that creates FSRS cards from conversation content, plus interactive /review flow with prompt types and FSRS rating.
- **Phase 5: Session Summary** — Post-session insights embed (top strengths, vocabulary expansion, queue health), session history persistence, and historical data retrieval.
