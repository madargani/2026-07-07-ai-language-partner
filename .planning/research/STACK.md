# Stack Research

**Domain:** AI Language Learning Discord Bot
**Researched:** 2026-07-07
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | 22.23.1 LTS | Runtime | Standard for Discord bots. Node 22 LTS is the safest choice — Active LTS through Oct 2026, then Maintenance LTS until Apr 2027. Discord.js 14.26.x requires Node 18+, and ts-fsrs 5.x requires 20+. Node 22 LTS hits the sweet spot of compatibility and support runway. |
| **TypeScript** | 5.9.x | Language | De facto standard for Node.js projects in 2026. TypeScript 6.0 deprecates `--moduleResolution node` and AMD/UMD targets, so 5.9 is the safe production choice with no migration surprises. discord.js ships built-in TypeScript declarations. |
| **discord.js** | 14.26.x | Discord API client | The dominant Discord bot library for Node.js (6K+ dependents). Targets Discord API v10 with first-class slash commands, components, and builders. v14 is the stable line throughout 2026. Requires Node 22.12.0+. |
| **PostgreSQL** | 17 | Database | Standard relational DB for this stack. Perfectly suited for structured user data, FSRS card state, and session history. PostgreSQL 17 shipped Sep 2024 and is production-proven — supports JSON via JSON_TABLE, robust indexing, and excellent concurrency for multi-user bot workloads. |
| **Prisma ORM** | 6.19.x | ORM / Data access | **Use Prisma 6, not 7.** Prisma 7 (released Nov 2025) made radical changes: removed Rust query engine in favor of WebAssembly, changed client generation, removed `$use()` middleware, and requires a `prisma.config.ts` with `defineConfig()`. These are breaking changes that add risk and complexity to a project that doesn't benefit from them. Prisma 6.19.3 (latest 6.x) is stable, well-documented, and the safer choice. Migrate to Prisma 7 later when the ecosystem stabilizes. |
| **ts-fsrs** | 5.4.1 | SRS algorithm | The canonical TypeScript implementation of the Free Spaced Repetition Scheduler (FSRS). Zero dependencies, active maintenance (685 GitHub stars), 50K+ weekly downloads and growing fast. Handles all FSRS-5 scheduling including learning steps, relearning steps, and fuzz. Required for the spaced repetition bank. |
| **BullMQ** | 5.79.x | Background job queue | De facto standard for Node.js background processing (3.8M+ weekly downloads). Used for the background LLM extraction pipeline. Built on Redis Streams for exactly-once processing, retries, dead-letter queues, and observability. The extraction pipeline (logging item performance from chat) is a perfect BullMQ use case — async, retryable, doesn't need to block the conversation flow. |
| **Redis** | 7.x | Queue backend / caching | Required by BullMQ for job storage and streaming. Also useful for caching LLM responses, session state, and rate-limit tracking. Redis 7 is the current stable line. |
| **OpenAI Node SDK** | 6.x | LLM API client | OpenAI remains the standard for LLM integration. The SDK now uses built-in `fetch` (Node 18+), supports GPT-5.5 and GPT-4o variants. Use SDK v6 directly for the high-tier conversation model. |
| **Anthropic Node SDK** | @anthropic-ai/sdk 0.105.x | LLM API client | Anthropic's official TypeScript SDK (24M+ weekly downloads). Used for Claude 3.5 Sonnet as the high-tier conversation model. Compatible with Node 18+. Model string: `claude-sonnet-4-20250514` or similar current variant. |
| **Docker Compose** | Compose Spec (v2 CLI) | Orchestration | Docker Compose V2+ uses the Compose Specification (no more `version:` top-level key). Use modern Compose syntax with health checks, named volumes, and depends_on conditions for PostgreSQL, Redis, and the bot service. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **@google/generative-ai** | latest | Gemini API client | When using Gemini 1.5 Flash as the low-tier extraction model. Google's official SDK. |
| **dotenv** | ^16.x | Environment config | Load `.env` for local development (Discord token, API keys, DB URLs). Standard Node.js practice. |
| **zlib-sync** | latest | WebSocket compression | Optional discord.js dependency for WebSocket data compression. Reduces bandwidth. |
| **bufferutil** | latest | WebSocket perf | Optional discord.js dependency for faster WebSocket connection. Recommended for production. |
| **zod** | ^3.x | Runtime validation | Validate LLM responses, command inputs, and config objects. Pairs naturally with TypeScript. |
| **vitest** | ^4.x | Testing | Modern, fast test runner compatible with TypeScript. Replaces Jest for new projects. |
| **ioredis** | ^5.x | Redis client | Required by BullMQ. Standard Redis client for Node.js with cluster and sentinel support. |
| **bull-board** | ^6.x | Queue monitoring | Optional web UI for inspecting BullMQ queues, retrying failed jobs, seeing job progress. Useful during development and for operational visibility. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **tsx** | TypeScript execution | `npx tsx src/index.ts` — run TypeScript directly without compilation step. Use for development. Production should use compiled JS. |
| **Docker Desktop / Docker Engine** | Container runtime | Required for Docker Compose. Docker Engine 29.x+ recommended with Compose V2 plugin. |
| **Prisma Studio** | DB GUI | `npx prisma studio` — visual database browser for development. |
| **Biome / ESLint** | Linting | Biome is the modern choice (used by ts-fsrs itself), but ESLint + @typescript-eslint is still standard for most teams. |

## Installation

```bash
# Core Discord bot + SRS
npm install discord.js@14 ts-fsrs@5

# Database (choose Prisma 6)
npm install @prisma/client@^6.19.0 prisma@^6.19.0 -D

# Background jobs
npm install bullmq ioredis

# LLM SDKs
npm install openai @anthropic-ai/sdk

# Optional: Gemini low-tier model
npm install @google/generative-ai

# Development
npm install -D typescript@~5.9.0 vitest tsx @types/node
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Prisma 6 | **Prisma 7** | If you want the new WebAssembly-based query compiler (3x faster queries on paper, 90% smaller bundles) and are willing to deal with breaking changes from `prisma-client-js` → `prisma-client` generator, removed `$use()`, and the new `prisma.config.ts` setup. Prisma 7 also requires Node 22+. **Recommendation:** start with Prisma 6, migrate to 7 once it's proven. |
| discord.js | **discord.py** | If you prefer Python. discord.py has feature parity for basic bots, but discord.js has better TypeScript support, more active development, and stronger ecosystem for Discord API changes. Our stack is TypeScript-first. |
| BullMQ | **In-process queue** (better-queue, p-queue) | If the background extraction pipeline is trivially small (single-user, low volume). BullMQ requires Redis which is operational overhead. But Redis is already useful for caching, and a proper queue provides retry logic, persistence across restarts, and visibility into failed jobs. |
| OpenAI SDK directly | **Vercel AI SDK** (`ai` + `@ai-sdk/*`) | If you want a unified API across all LLM providers and don't mind the extra abstraction layer. The AI SDK v7 is mature, supports OpenAI/Anthropic/Google with a single `generateText()` call. **However**, for this bot we have different reliability/performance requirements per model (conversation vs extraction), so direct SDK control is better. |
| Prisma ORM | **Drizzle ORM** | If you prefer SQL-like query building, lighter weight, and are comfortable writing raw SQL for complex queries. Drizzle is 0-dependency and performs well. However, Prisma's schema-first approach provides better migration tooling and the client generation matches the TypeScript-first philosophy better. **Stick with Prisma** for this project. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **discord.js v13** | Deprecated, uses Discord API v9, missing first-class slash commands. | discord.js v14.26.x |
| **Bull (original)** | Deprecated in favor of BullMQ. Original Bull uses Redis Lists (less reliable), lacks TypeScript types, and is no longer actively maintained. | BullMQ 5.x |
| **Sequelize** | Outdated ORM with poor TypeScript support and verbose query syntax. TypeScript ecosystem has moved past it. | Prisma 6 or Drizzle |
| **TypeScript 6.0** | Too new. Deprecates `--moduleResolution node`, AMD/UMD targets, and `baseUrl`. These deprecations don't affect us directly but tools/libraries may not be fully compatible yet. Available as opt-in once ecosystem catches up. | TypeScript 5.9.x |
| **OpenAI SDK v4** | Old major version that used axios/node-fetch. SDK v5+ uses built-in `fetch` (smaller bundle, better edge compat). | OpenAI SDK v6.x |
| **Kue / Agenda** | Both are effectively unmaintained. Kue is archived, Agenda gets minimal updates. | BullMQ 5.x |
| **node-schedule / node-cron** | These work for simple cron jobs but don't provide persistence, retries, or monitoring. Our extraction pipeline needs more. | BullMQ with repeatable jobs |
| **TypeORM** | Configuration-heavy, complex decorator syntax, slower than Prisma for schema migrations. Used in legacy NestJS projects but not recommended for new ones. | Prisma 6 |

## Stack Patterns by Variant

**If using a unified LLM abstraction layer:**
- Use Vercel AI SDK (`ai` + `@ai-sdk/openai` + `@ai-sdk/anthropic`)
- Because: Single `generateText()` / `streamText()` API across all providers. Simpler switching between models.
- **Tradeoff:** Less control over per-model parameters and error handling. The AI SDK adds abstraction that can obscure issues.

**If optimizing for cost (extraction pipeline):**
- Use `@google/generative-ai` directly for the low-tier model (Gemini 1.5 Flash offers competitive pricing)
- Because: Gemini 1.5 Flash is significantly cheaper than GPT-4o-mini for batch extraction workloads
- **Tradeoff:** Different API shape from OpenAI/Anthropic, but extraction pipeline is isolated enough that this doesn't matter.

**If deploying without Redis (simplified, single-user):**
- Replace BullMQ with `p-queue` + SQLite/PG-based job persistence
- Because: Eliminates the Redis operational dependency for a single-user bot
- **Tradeoff:** No retry persistence across restarts, no monitoring UI, no dead-letter queue. Viable for personal use only.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| discord.js@14.26.x | Node.js 22.12.0+ | Requires Node 22.12.0 minimum. discord.js 14.21.0 required Node 18+. The latest bumps this to 22.12.0. |
| ts-fsrs@5.4.x | Node.js 20+ | Zero dependencies. Pure TypeScript. Works with any modern Node.js. |
| @prisma/client@6.19.x | Node.js 18.0+ | Prisma 6 supports Node 18+. Prisma 7 requires Node 22+. |
| bullmq@5.79.x | Redis 7.x + Node 18+ | Uses Redis Streams. Requires a Redis 6.2+ instance (Redis 7 recommended). |
| openai@6.x | Node.js 18+ | Built-in `fetch` required. Node 18+ has this natively. |
| @anthropic-ai/sdk@0.105.x | Node.js 18+ | TypeScript 4.9+. Supports Node 20 LTS+ recommended. |

## Key Architectural Decision: Prisma 6 vs 7

This deserves explicit attention because it affects the entire data layer.

**Prisma 6** (6.19.3): Stable, Rust-based query engine, uses `prisma-client-js` generator, `@prisma/client` imports, `$use()` middleware. Well-documented with years of community experience.

**Prisma 7** (7.8.0): WebAssembly-based query compiler (3x faster, 90% smaller), new `prisma-client` generator, requires `prisma.config.ts` with `defineConfig()`, no `$use()` middleware (use Client Extensions instead), ESM-first.

**Recommendation for this project:** Use **Prisma 6**.
- The project is a Discord bot, not a serverless function — bundle size doesn't matter
- The Prisma 7 migration from v5/v6 is non-trivial (schema changes, import changes, middleware changes)
- Prisma 6 is proven and stable; the project benefits from zero ORM migration risk
- Migrate to Prisma 7 in a future milestone once the ecosystem has settled

## Prisma Schema Direction

```prisma
generator client {
  provider = "prisma-client-js"  // Prisma 6 generator
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  discordId     String   @unique
  nativeLang    String   // e.g. "en"
  targetLang    String   // e.g. "es"
  skillProfile  Json?    // Implicit skill state (LLM-inferred)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  cards         FSRSCard[]
  sessions      Session[]
}

model FSRSCard {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])

  // The item being learned
  sourceLang  String   // language of the term
  targetLang  String   // language of the definition
  sourceText  String   // the foreign term/phrase
  targetText  String   // translation/definition

  // FSRS state — ts-fsrs Card shape
  due         DateTime
  stability   Float
  difficulty  Float
  elapsedDays Int
  scheduledDays Int
  reps        Int
  lapses      Int
  state       Int      // 0=New, 1=Learning, 2=Review, 3=Relearning
  lastReview  DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, due])
}

model Session {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  messageCount Int     @default(0)
  corrections Int     @default(0)
  summary     Json?    // Generated session summary
}
```

## Sources

- [discord.js v14.26.4 — npm](https://www.npmjs.com/package/discord.js) — Official package, verified version
- [ts-fsrs v5.4.1 — npm](https://www.npmjs.com/package/ts-fsrs) — Official package, verified version and API
- [Prisma 7.8.0 Changelog — releases.sh](https://releases.sh/prisma/prisma) — Version tracking and breaking changes
- [Prisma v5→v7 Migration — GitHub issue #413](https://github.com/akoita/resonate/issues/413) — Documented migration pain points
- [BullMQ 5.79.x — npm](https://www.npmjs.com/package/bullmq) — Official package, verified 3.8M weekly downloads
- [BullMQ 5 Guide 2026 — 1xAPI](https://1xapi.com/blog/bullmq-5-background-job-queues-nodejs-2026-guide) — Production patterns
- [OpenAI Node SDK v6.45.0 — releases.sh](https://releases.sh/openai/openai-node-sdk) — Version tracking
- [@anthropic-ai/sdk v0.105.0 — npm](https://www.npmjs.com/package/@anthropic-ai/sdk) — Official package
- [Node.js release schedule — endoflife.date](https://endoflife.date/nodejs) — LTS timeline verification
- [PostgreSQL 17 lifecycle — versionlog.com](https://versionlog.com/postgresql/17/) — Current version and EOL dates
- [Docker Compose v5 history — Docker Docs](https://docs.docker.com/compose/intro/history/) — Version history

---
*Stack research for: AI Language Learning Discord Bot*
*Researched: 2026-07-07*
