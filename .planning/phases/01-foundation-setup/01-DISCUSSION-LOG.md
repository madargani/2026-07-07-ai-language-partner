# Phase 1: Foundation & Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 1-Foundation & Setup
**Areas discussed:** Bot Project Structure, /setup Command UX, Prisma User Model, Graceful Shutdown, Config Management, Docker Compose

---

## Bot Project Structure

| Option | Description | Selected |
|--------|-------------|----------|
| By feature | Folders per domain: setup/, conversation/, review/, etc. | ✓ |
| By layer | Top-level folders by role: commands/, services/, db/, types/ | |

**User's choice:** By feature

| Option | Description | Selected |
|--------|-------------|----------|
| src/lib/ or src/shared/ | Top-level shared folder for cross-cutting utilities | ✓ |
| src/core/ | Core module with client init, event bus, plugin-like loader | |

**User's choice:** src/lib/ or src/shared/

| Option | Description | Selected |
|--------|-------------|----------|
| Single file per command | SlashCommandBuilder + execute() in one file | ✓ |
| Command + handler split | Separate definition from execution logic | |

**User's choice:** Single file per command

| Option | Description | Selected |
|--------|-------------|----------|
| Single tsconfig.json | One config for everything | ✓ |
| Composite project | Separate tsconfig for dev vs build | |

**User's choice:** Single tsconfig.json

---

## /setup Command UX

| Option | Description | Selected |
|--------|-------------|----------|
| Slash command options only | /setup native:English target:Spanish — one-shot | |
| Interactive select menus | Two dropdowns with language options | ✓ |

**User's choice:** Interactive select menus

| Option | Description | Selected |
|--------|-------------|----------|
| Update individual fields | Change just target_language without re-entering native | |
| Full re-entry | /setup always overwrites all settings | ✓ |

**User's choice:** Full re-entry

| Option | Description | Selected |
|--------|-------------|----------|
| Curated shortlist (15-20 languages) | Most common languages, covers 95% of use cases | ✓ |
| Exhaustive list | Full language list, more inclusive but longer | |

**User's choice:** Curated shortlist

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-trigger /setup | /new starts /setup flow automatically | |
| Error message only | /new tells user to run /setup first | ✓ |

**User's choice:** Error message only

---

## Prisma User Model

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal — Phase 1 only | discord_id, native_language, target_language, created_at, updated_at | ✓ |
| Include skill profile now | Also add skill_level and fields ready for Phase 2 | |

**User's choice:** Minimal

| Option | Description | Selected |
|--------|-------------|----------|
| ISO 639-1 codes | Two-letter language codes ('en', 'es') | ✓ |
| Full language names | Human-readable strings | |

**User's choice:** ISO 639-1 codes

| Option | Description | Selected |
|--------|-------------|----------|
| String field | Simple TEXT column | ✓ |
| Prisma enum | Type-safe at DB level | |

**User's choice:** String field

| Option | Description | Selected |
|--------|-------------|----------|
| Infer from field presence | Configured if both language fields non-null | |
| Explicit 'configured' flag | Separate boolean field | ✓ |

**User's choice:** Explicit 'configured' flag

---

## Graceful Shutdown

| Option | Description | Selected |
|--------|-------------|----------|
| Disconnect Prisma + destroy client | Simple cleanup, no session save | ✓ |
| Full graceful — save session state | Also save in-memory state to PostgreSQL | |

**User's choice:** Disconnect Prisma + destroy client (no sessions exist yet in Phase 1)

| Option | Description | Selected |
|--------|-------------|----------|
| process.on() handlers | Listen for SIGTERM/SIGINT in Node process | ✓ |
| Docker entrypoint wrapper | Shell script that traps signals | |

**User's choice:** process.on() handlers

| Option | Description | Selected |
|--------|-------------|----------|
| HEALTHCHECK via process status | Docker checks Node process is alive | ✓ |
| HEALTHCHECK HTTP endpoint | Small HTTP server on side port | |

**User's choice:** HEALTHCHECK via process status

---

## Config Management

| Option | Description | Selected |
|--------|-------------|----------|
| Zod validation at startup | Parse and validate all env vars on boot | ✓ |
| Direct process.env access | Access env vars directly, errors surface at use | |

**User's choice:** Zod validation at startup

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal set | DISCORD_TOKEN, DATABASE_URL, REDIS_URL | ✓ |
| Include future LLM keys | Also OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY | |

**User's choice:** Minimal set

| Option | Description | Selected |
|--------|-------------|----------|
| .env.example only | Committed, user copies to .env | ✓ |
| .env + .env.example | .env with defaults committed | |

**User's choice:** .env.example only

---

## Docker Compose

| Option | Description | Selected |
|--------|-------------|----------|
| Single compose file | One docker-compose.yml | |
| Compose + dev override | docker-compose.yml (base) + docker-compose.dev.yml | ✓ |

**User's choice:** Compose + dev override

| Option | Description | Selected |
|--------|-------------|----------|
| tsx watch (hot-reload) | Source changes auto-restart the bot | ✓ |
| Build + run | Build TS to JS then run | |

**User's choice:** tsx watch (hot-reload)

| Option | Description | Selected |
|--------|-------------|----------|
| Bind mount node_modules | Mount local node_modules into container | |
| Rebuild on changes | npm ci in Dockerfile, no bind mount | ✓ |

**User's choice:** Rebuild on changes (no bind mount)

| Option | Description | Selected |
|--------|-------------|----------|
| Health checks + depends_on | Bot waits for Postgres/Redis readiness | ✓ |
| Simple depends_on only | Docker starts in order, bot retries internally | |

**User's choice:** Health checks + depends_on

---

## the agent's Discretion

No areas deferred to agent discretion — all decisions were explicitly chosen.

## Deferred Ideas

- Skill profile fields in User model — will be added in Phase 2
- LLM API keys in env — will be added in Phase 2
- Session state rehydration on shutdown — will be implemented in Phase 2 when sessions exist
