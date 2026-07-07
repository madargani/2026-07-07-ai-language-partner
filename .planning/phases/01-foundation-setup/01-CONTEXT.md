# Phase 1: Foundation & Setup - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the operational foundation: a working Discord bot skeleton that connects, registers slash commands, persists user language configuration via Prisma/PostgreSQL, and runs in Docker Compose alongside PostgreSQL and Redis.

**Requirements (from REQUIREMENTS.md):** SETUP-01, SETUP-02, SETUP-03, INFRA-01, INFRA-02, INFRA-04, INFRA-05

**Success Criteria (from ROADMAP.md):**
1. User can run /setup to select native and target language, and the choice is stored
2. User settings persist across bot restarts (verified by restarting container and re-checking)
3. First-time user running /new is prompted through /setup before proceeding
4. Docker Compose starts all services (bot, PostgreSQL, Redis) with a single command
5. All slash commands respond within 3 seconds using deferReply() pattern

</domain>

<decisions>
## Implementation Decisions

### Bot Project Structure
- **D-01:** Source tree organized by feature (`setup/`, `conversation/`, `review/` etc.)
- **D-02:** Shared utilities in `src/lib/` or `src/shared/`
- **D-03:** Commands as single files (SlashCommandBuilder + execute() in one file)
- **D-04:** Single `tsconfig.json` (no composite project)

### /setup Command UX
- **D-05:** Interactive select menus (two dropdowns: native language, target language)
- **D-06:** Full re-entry on /setup (always overwrites both languages — no partial updates)
- **D-07:** Curated shortlist of 15–20 common languages
- **D-08:** /new with unconfigured user returns error message telling them to run /setup first (no auto-trigger)

### Prisma User Model
- **D-09:** Minimal fields for Phase 1: `discord_id`, `native_language`, `target_language`, `configured`, `created_at`, `updated_at`. Skill profile fields deferred to Phase 2.
- **D-10:** ISO 639-1 codes for language storage (e.g., `en`, `es`)
- **D-11:** String field for languages (not Prisma enum)
- **D-12:** Explicit `configured` boolean flag (not inferred from null fields)

### Graceful Shutdown
- **D-13:** On SIGTERM/SIGINT: disconnect Prisma + destroy Discord client. No in-memory session save (no sessions exist yet in Phase 1).
- **D-14:** `process.on()` handlers for signal handling
- **D-15:** HEALTHCHECK via container process status (no HTTP endpoint)

### Config Management
- **D-16:** Zod validation at startup for all env vars
- **D-17:** Minimal env var set for Phase 1: `DISCORD_TOKEN`, `DATABASE_URL`, `REDIS_URL`
- **D-18:** `.env.example` only (no `.env` committed)

### Docker Compose
- **D-19:** Split compose: `docker-compose.yml` (base) + `docker-compose.dev.yml` (overrides)
- **D-20:** `tsx watch` for hot-reload in dev container
- **D-21:** Rebuild on changes (no bind mount for `node_modules`)
- **D-22:** Health checks + `depends_on` conditions for PostgreSQL (pg_isready) and Redis

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Definition
- `.planning/PROJECT.md` — Project vision, constraints, key decisions
- `.planning/REQUIREMENTS.md` — All v1 requirements mapped to phases

### Phase Definition
- `.planning/ROADMAP.md` §"Phase 1: Foundation & Setup" — Goal, success criteria, requirements

### Technology Stack
- `AGENTS.md` (`.planning/` included via STACK.md section) — Technology stack decisions, version choices, what NOT to use

No external specs or ADRs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None** — This is a greenfield project. No existing code to reuse.

### Established Patterns
- **None** — Patterns will be established by this phase.

### Integration Points
- **None yet** — All code is new. Docker Compose ties together the three services (bot, PostgreSQL, Redis).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for the technologies involved (discord.js, Prisma, Docker Compose).

</specifics>

<deferred>
## Deferred Ideas

- **Skill profile fields in User model** — Will be added in Phase 2 when implicit profiling is implemented. Don't model them now.
- **LLM API keys in env** — Will be added in Phase 2 when AI conversation is implemented. Out of scope for Phase 1 minimal env set.
- **Session state rehydration** — INFRA-05 requires graceful shutdown saving session state, but Phase 1 has no sessions yet. Full graceful shutdown with session save will be implemented in Phase 2 when CONV-08 is addressed.

</deferred>

---

*Phase: 1-Foundation & Setup*
*Context gathered: 2026-07-07*
