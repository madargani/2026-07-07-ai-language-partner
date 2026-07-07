# Architecture Research

**Domain:** AI Language Learning Discord Bot
**Researched:** 2026-07-07
**Confidence:** HIGH

## Standard Architecture

### System Overview

The bot follows a **layered monolith** architecture with four horizontal layers and one vertical cross-cutting concern (FSRS). This is the standard pattern for production Discord bots in this complexity class — microservices are unwarranted for a single-bot deployment with Docker Compose and <1K guilds.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        DISCORD GATEWAY LAYER                          │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Client (wss)   │  │ Slash Command    │  │  Event Listeners    │  │
│  │  discord.js v14 │  │ Handlers         │  │  (messageCreate,    │  │
│  │                 │  │ (/setup, /start, │  │   interactionCreate) │  │
│  │                 │  │  /review, /end,  │  │                     │  │
│  │                 │  │  /summary)       │  │                     │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
│           │                    │                        │            │
└───────────┼────────────────────┼────────────────────────┼────────────┘
            │                    │                        │
┌───────────┼────────────────────┼────────────────────────┼────────────┐
│           ▼                    ▼                        ▼            │
│                        SERVICE LAYER                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │ SessionService  │  │ ConversationSvc  │  │  ReviewService      │  │
│  │ - lifecycle     │  │ - correction     │  │  - due card fetch   │  │
│  │ - context       │  │   budget tracking│  │  - prompt building  │  │
│  │ - summary       │  │ - code-switch    │  │  - rating process   │  │
│  │                 │  │   extraction     │  │  - queue health     │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
└───────────┼────────────────────┼────────────────────────┼────────────┘
            │                    │                        │
┌───────────┼────────────────────┼────────────────────────┼────────────┐
│           ▼                    ▼                        ▼            │
│                      AI INTEGRATION LAYER                            │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                   LLM Service (model router)                  │    │
│  │                                                              │    │
│  │  ┌──────────────────┐    ┌──────────────────┐                │    │
│  │  │ High-tier: GPT-4o/│    │ Low-tier: GPT-4o- │              │    │
│  │  │ Claude 3.5 Sonnet │    │ mini/Gemini Flash │              │    │
│  │  │ → conversation   │    │ → extraction     │              │    │
│  │  │ → review prompts │    │ → item logging   │              │    │
│  │  └──────────────────┘    └──────────────────┘                │    │
│  └──────────────────────────────────────────────────────────────┘    │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────────┐
│           ▼               ▼               ▼                          │
│                      DATA ACCESS LAYER                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  PrismaService  │  │  Repository      │  │  SRS Engine         │  │
│  │  (client conn)  │  │  Pattern         │  │  (ts-fsrs pure fn)  │  │
│  │                 │  │  - UserRepo      │  │                     │  │
│  │                 │  │  - SessionRepo   │  │  fsrs.next(card,   │  │
│  │                 │  │  - ItemRepo      │  │    now, rating)     │  │
│  │                 │  │  - ReviewLogRepo │  │                     │  │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘  │
└───────────┼────────────────────┼────────────────────────┼────────────┘
            │                    │                        │
┌───────────┼────────────────────┼────────────────────────┼────────────┐
│           ▼                    ▼                        ▼            │
│                         DATA LAYER                                   │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    PostgreSQL (via Docker)                     │    │
│  │  ┌─────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐ │    │
│  │  │  users  │ │  sessions  │ │  items   │ │  review_logs     │ │    │
│  │  └─────────┘ └───────────┘ └──────────┘ └──────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Discord Client** | WebSocket connection to Discord gateway, event emission, rate-limit compliance | `discord.js` v14 `Client` with `GatewayIntentBits.Guilds`, `MessageContent`, `GuildMessages` |
| **Command Handlers** | Slash command registration, parameter parsing, interaction reply lifecycle | `SlashCommandBuilder` + `execute(interaction)` pattern, per-command files |
| **Event Listeners** | `messageCreate` for conversation capture, `interactionCreate` for command dispatch | Event files loaded dynamically by type |
| **SessionService** | Session CRUD, active session tracking per user, context preservation, summary generation | Singleton service with per-user state map + DB persistence |
| **ConversationService** | Conversation flow: message → context assembly → LLM call → rate-limited corrections → reply formatting | Stateless service, orchestrates LLM calls per message |
| **ReviewService** | Due card query, prompt type selection, FSRS rating processing, queue health metrics | Reads items + review_logs, calls SRS Engine, returns next state |
| **LLM Service** | Model routing (high/low tier), prompt template management, API client abstraction, retry/backoff | OpenAI SDK + Anthropic SDK behind a common `LLMProvider` interface |
| **PrismaService** | Singleton Prisma client, connection lifecycle, transaction management | `@prisma/client` singleton with `PrismaClient` |
| **Repositories** | Type-safe data access per entity, query encapsulation, migration-safe queries | Prisma-generated types + repository classes wrapping `prisma.model` |
| **SRS Engine** | Pure FSRS scheduling computation — takes card + rating + date, returns new card + review log | `ts-fsrs` `fsrs()` scheduler, zero dependencies, no I/O |
| **PostgreSQL** | Persistent storage for all entities, Indexed on user_id + due date for review queries | Docker Postgres 16, Prisma migrations |

## Recommended Project Structure

```
src/
├── index.ts                    # Entry point: client init, handler registration, Prisma connect
├── client.ts                   # Discord Client setup, intent configuration, login
│
├── commands/                   # Slash command definitions (one file per command)
│   ├── setup.ts                #   /setup — language pair configuration
│   ├── start.ts                #   /start — begin conversation session
│   ├── review.ts               #   /review — start review session with due items
│   ├── end.ts                  #   /end — end current session
│   └── summary.ts              #   /summary — current session report
│
├── events/                     # Discord event handlers
│   ├── ready.ts                #   client.on('ready') — log startup
│   └── messageCreate.ts        #   client.on('messageCreate') — capture conversation
│
├── services/                   # Business logic layer
│   ├── session.service.ts      #   Session lifecycle, context assembly, summary generation
│   ├── conversation.service.ts #   Message → AI → correction pipeline with budget tracking
│   └── review.service.ts       #   Review flow orchestration, prompt building, FSRS integration
│
├── ai/                         # AI integration layer
│   ├── llm.service.ts          #   Unified LLM provider interface, model routing logic
│   ├── providers/
│   │   ├── openai.provider.ts  #   OpenAI SDK adapter (GPT-4o, GPT-4o-mini)
│   │   └── anthropic.provider.ts # Anthropic SDK adapter (Claude 3.5 Sonnet)
│   ├── prompts/
│   │   ├── conversation.ts     #   System prompt for natural conversation
│   │   ├── correction.ts       #   Correction extraction prompt
│   │   ├── item-extraction.ts  #   Vocabulary/grammar item extraction prompt
│   │   └── review.ts           #   Review prompt types (translation, fill-blank, etc.)
│   └── model-router.ts         #   Route to high-tier vs low-tier based on operation type
│
├── srs/                        # Spaced repetition engine wrapper
│   ├── scheduler.ts            #   ts-fsrs initialization with project parameters
│   ├── types.ts                #   Project-specific card/log types (extending fsrs types)
│   └── operations.ts           #   schedule(), getDueCards(), getQueueStats()
│
├── repositories/               # Data access layer
│   ├── user.repository.ts      #   User CRUD
│   ├── session.repository.ts   #   Session persistence, active session queries
│   ├── item.repository.ts      #   SRS item CRUD, due-by queries, deck health
│   └── review-log.repository.ts # Review log recording and statistics
│
├── database/                   # Database service
│   └── prisma.service.ts       #   Singleton PrismaClient, graceful shutdown
│
├── types/                      # Shared TypeScript types
│   ├── models.ts               #   Domain-specific interfaces (Session, CorrectionBudget, etc.)
│   ├── discord.ts              #   Command option types, interaction helpers
│   └── llm.ts                  #   LLM request/response types, provider interface
│
├── utils/                      # Utilities
│   ├── logger.ts               #   Structured logging (pino or winston)
│   ├── config.ts               #   Environment config loader with validation
│   ├── errors.ts               #   Custom error types (SessionNotFoundError, etc.)
│   └── rate-limiter.ts         #   Per-user message rate limiting for LLM calls
│
└── prisma/                     # Prisma schema and migrations (generated)
    └── schema.prisma           #   Data model definitions
```

### Structure Rationale

- **`commands/` and `events/`:** Standard discord.js pattern — each file owns one command/event. The framework auto-loads them via file-system scanning, making the handler registration zero-maintenance. This is the ecosystem convention for v14.

- **`services/`:** Encapsulates all business logic. Services are stateless (except `SessionService` which holds ephemeral per-user state). They orchestrate across repositories, the SRS engine, and the LLM service without importing discord.js types — keeping business logic decoupled from the Discord transport.

- **`ai/`:** Separated from services because it has its own concerns: provider abstraction, prompt management, model routing, and retry logic. This layer is the part most likely to need swapping (different model providers, prompt versioning).

- **`srs/`:** Kept separate because `ts-fsrs` is a pure computation library (no I/O). It's wrapped here for project-specific defaults and to keep the fsrs import surface contained to one directory. This makes upgrading ts-fsrs or swapping the SRS algorithm a single-file change.

- **`repositories/`:** Thin wrappers over Prisma generated types. They exist so that if the query pattern needs to change (e.g., adding caching), there's a single place to do it. Not strictly necessary at this scale — could use Prisma directly — but pays for itself once you need non-trivial queries.

- **`database/prisma.service.ts`:** The Prisma client must be a singleton (each instance is a connection pool) and must be properly disconnected on shutdown. This file owns that lifecycle.

## Architectural Patterns

### Pattern 1: Command Handler (discord.js Slash Commands)

**What:** Each slash command is a module exporting `data` (the `SlashCommandBuilder` definition) and `execute` (the handler function). A loader scans the `commands/` directory at startup and registers them.

**When to use:** Always — this is the standard discord.js v14 pattern. The alternative (a giant if/else chain in a single file) does not scale past 3 commands.

**Trade-offs:** Slightly more boilerplate per command, but infinitely more maintainable. Discord.js requires command registration via REST API separately from command execution — the loader handles both.

**Example:**
```typescript
// commands/setup.ts
import { SlashCommandBuilder } from 'discord.js';
import { Command } from '../types/discord';

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure your native and target languages')
    .addStringOption(opt => opt.setName('native').setDescription('Your native language').setRequired(true))
    .addStringOption(opt => opt.setName('target').setDescription('Language to learn').setRequired(true)),

  async execute(interaction) {
    const native = interaction.options.getString('native', true);
    const target = interaction.options.getString('target', true);
    // delegate to service
    await interaction.deferReply();
    const result = await sessionService.setupUser(interaction.user.id, native, target);
    await interaction.editReply(result.message);
  },
};
```

### Pattern 2: Service Layer (Business Logic Orchestration)

**What:** Service classes contain business logic and orchestrate across repositories, AI, and SRS. They accept user IDs and structured data — never Discord interaction objects. This keeps them testable and transport-agnostic.

**When to use:** Any non-trivial operation that involves multiple data sources or conditional logic.

**Trade-offs:** Adds indirection. Commands become thin delegates. But the payoff is that you can unit-test the service without a Discord connection, and you could theoretically swap Discord for another interface (though not in scope here).

**Example:**
```typescript
// services/conversation.service.ts
export class ConversationService {
  constructor(
    private readonly llm: LlmService,
    private readonly itemRepo: ItemRepository,
    private readonly sessionRepo: SessionRepository,
  ) {}

  async processMessage(userId: string, message: string): Promise<ConversationResult> {
    const session = await this.sessionRepo.findActive(userId);
    if (!session) throw new SessionNotFoundError(userId);

    // 1. Build context from session history
    const context = await this.buildContext(session);

    // 2. Call high-tier LLM for conversation + correction
    const llmResponse = await this.llm.converse(context, message, session.correctionBudget);

    // 3. If corrections made, decrement budget
    if (llmResponse.corrections.length > 0) {
      await this.sessionRepo.decrementBudget(session.id, llmResponse.corrections.length);
    }

    // 4. Call low-tier LLM to extract potential SRS items from message
    const extracted = await this.llm.extractItems(message, session.targetLanguage);

    // 5. Persist extracted items as new SRS cards
    for (const item of extracted) {
      const card = createEmptyCard();
      await this.itemRepo.create({ userId, ...item, fsrsCard: card });
    }

    // 6. Log to session history
    await this.sessionRepo.appendMessage(session.id, { role: 'user', text: message });
    await this.sessionRepo.appendMessage(session.id, { role: 'assistant', text: llmResponse.reply });

    return { reply: llmResponse.reply, corrections: llmResponse.corrections };
  }
}
```

### Pattern 3: Provider Abstraction (LLM Model Routing)

**What:** A common `LLMProvider` interface that both OpenAI and Anthropic adapters implement. The `ModelRouter` picks the right provider + model tier based on the operation type (conversation → high-tier, extraction → low-tier).

**When to use:** When you call multiple AI providers and need to route by capability or cost.

**Trade-offs:** Adds abstraction overhead for what could be direct SDK calls. Worth it because: (a) model pricing changes rapidly and you'll want to swap tiers, (b) you may add providers, (c) testing without real API calls requires this seam.

**Example:**
```typescript
// ai/llm.service.ts
export class LlmService {
  private highTier: LLMProvider;
  private lowTier: LLMProvider;

  async converse(context: SessionContext, message: string, budget: CorrectionBudget): Promise<ConverseResponse> {
    return this.highTier.complete({
      system: CONVERSATION_PROMPT,
      messages: [...context.messages, { role: 'user', content: message }],
      responseFormat: { corrections: 'array', reply: 'string' },
      maxCorrections: budget.remaining,
    });
  }

  async extractItems(message: string, language: string): Promise<ExtractedItem[]> {
    return this.lowTier.complete({
      system: ITEM_EXTRACTION_PROMPT(language),
      messages: [{ role: 'user', content: message }],
      responseFormat: { items: 'array' },
    });
  }
}
```

### Pattern 4: Pure SRS Engine Wrapper

**What:** `ts-fsrs` is a pure function library with zero I/O. It takes `(card, date, rating)` and returns `(newCard, reviewLog)`. The wrapper in `srs/` calls it and hands results to repositories for persistence. The SRS engine never touches the database.

**When to use:** Always with ts-fsrs — its design assumes this separation.

**Trade-offs:** Forces you to load the card from DB before scheduling, then persist after. This is correct but means two DB round-trips per review. For a single-user bot this is irrelevant; for 1000 concurrent reviewers you'd batch.

**Example:**
```typescript
// srs/scheduler.ts
import { fsrs, createEmptyCard, Rating, type Card, type ReviewLog } from 'ts-fsrs';

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: true,
});

export function scheduleCard(card: Card, rating: Rating, now: Date = new Date()): { card: Card; log: ReviewLog } {
  return scheduler.next(card, now, rating, (result) => result);
}

export function createCard() {
  return createEmptyCard();
}
```

## Data Flow

### Request Flows

#### Conversation Flow
```
User sends message in channel
    ↓
messageCreate event fires
    ↓
Event listener extracts userId, channelId, message content
    ↓
ConversationService.processMessage()
    ↓
  ├─ SessionService: load active session + context history
  ├─ LLM Service (high-tier): converse() → reply + corrections
  ├─ SessionService: update correction budget
  ├─ LLM Service (low-tier): extractItems() → vocabulary candidates
  ├─ Item Repository: create new SRS cards for extracted items
  └─ SessionRepository: append to message history
    ↓
Response sent to Discord channel
```

#### Review Flow
```
User runs /review
    ↓
review command handler
    ↓
ReviewService.startSession(userId)
    ↓
  ├─ ItemRepository: query due cards (due <= now, by user)
  ├─ SRS Engine: for each due card, determine prompt type
  └─ Return first due card with prompt
    ↓
Send prompt to user (embed or message)
    ↓
User responds with rating (Again/Hard/Good/Easy)
    ↓
ReviewService.submitRating(cardId, rating)
    ↓
  ├─ ItemRepository: load card
  ├─ SRS Engine: scheduleCard(card, rating, now) → new card + log
  ├─ ItemRepository: update card with new schedule
  └─ ReviewLogRepository: persist log
    ↓
Send next due card or queue-complete summary
```

#### Session End / Summary Flow
```
User runs /end or /summary
    ↓
SessionService.endSession(userId)
    ↓
  ├─ SessionRepository: calculate session stats
  │   (message count, corrections given, items extracted)
  ├─ ItemRepository: queue health (due count, total items, retention trend)
  └─ Assemble summary
    ↓
Respond with summary embed
```

### State Management

| State | Location | Lifetime | Notes |
|-------|----------|----------|-------|
| **Active Sessions** | In-memory Map<userId, Session> | Ephemeral (lost on restart) | Used for fast context lookup. Rehydrated from DB on startup. |
| **Correction Budget** | In-memory on Session | Per-session | Reset each session. Tracked in memory + persisted to DB for crash recovery. |
| **SRS Card State** | PostgreSQL (items table) | Permanent | Each card's `due`, `stability`, `difficulty`, `state` persisted. FSRS operates on loaded copies. |
| **Review Logs** | PostgreSQL (review_logs table) | Permanent | Immutable append-only log per rating. Used for analytics and FSRS parameter optimization. |
| **Conversation History** | PostgreSQL (session messages) | Session lifetime + 24h | Pruned after session ends + grace period. Keeps context size bounded. |
| **LLM Provider Config** | Environment variables | Permanent | Model names, API keys, tier assignments. Loaded at startup. |

### Key Data Flows

1. **Conversation → Item Extraction:** User messages flow through two LLM calls in sequence: first high-tier for reply + corrections, then (in parallel or immediately after) low-tier for item extraction. The extraction result creates new `FSRSItem` records with `createEmptyCard()` state.

2. **Review → Reschedule:** Each review rating triggers `ts-fsrs.next()`, which is a pure computation producing a new `Card` and `ReviewLog`. The new card overwrites the old in the `items` table; the log is appended to `review_logs`. This is a two-write operation best wrapped in a Prisma transaction.

3. **Code-switch → Auto-item:** When the LLM detects code-switching (native language terms used in target-language conversation), the extraction prompt flags these. They become items with higher priority (shorter initial interval). This is the same flow as standard extraction but with a different `source` tag.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users (single server) | Monolith as designed. Docker Compose with one bot process. No changes needed. |
| 1k-100k users (multi-server) | Shard the Discord client (discord.js built-in sharding). Add Redis for session state (move from in-memory Map to Redis). Consider bot sharding for ~2500 guilds per shard. |
| 100k+ users (many servers) | Split AI integration into a separate process with a message queue (RabbitMQ/Redis streams). Service layer becomes an HTTP API. Multiple bot shards + horizontal AI processing workers. |

### Scaling Priorities

1. **First bottleneck: LLM API rate limits.** Each conversation message generates 2 LLM calls (high + low tier). At even modest usage, API rate limits will be hit before any other bottleneck. Mitigation: per-user rate limiter (max 10 messages/minute), queuing for LLM calls, and using the lowest viable model tier for extraction.

2. **Second bottleneck: Database write throughput.** Every message creates writes (session log append, item creation, budget updates). PostgreSQL handles this easily at small scale, but at 100+ concurrent conversations, consider batching item creation and using connection pooling (PgBouncer).

### What Won't Be a Problem

- **Discord gateway rate limits:** Discord's standard 50 commands/second per bot is generous for a single-server bot.
- **FSRS computation:** `ts-fsrs` is pure math — millions of scheduling operations per second on a single core. This will never be the bottleneck.

## Anti-Patterns

### Anti-Pattern 1: Embedding Discord Types in Business Logic

**What people do:** Passing `Interaction` or `Message` objects from discord.js directly into service functions.

**Why it's wrong:** Binds business logic to the Discord transport. Unit tests need a mock Discord client. You can't easily reuse the logic for a different interface (hypothetical API/web). Every service call signature is polluted with framework types.

**Do this instead:** Services accept plain values (strings, numbers, enums). The command handler is responsible for extracting values from the interaction and formatting the result back. The boundary is at `commands/*.ts`.

### Anti-Pattern 2: LLM Calls Inside Command Handlers

**What people do:** Calling `openai.chat.completions.create()` directly inside a command's `execute()` function.

**Why it's wrong:** Command handlers should be thin delegates — they parse input and call services. LLM calls have their own concerns: retry logic, model routing, token management, response parsing. Mixing them into command handlers makes them untestable and impossible to reuse.

**Do this instead:** All AI interaction goes through `ai/llm.service.ts`, which is injected into the service layer. Command handlers never import an SDK.

### Anti-Pattern 3: Session Context in Discord Channel Topics or Threads

**What people do:** Using Discord thread metadata or channel topics to store conversation context, avoiding a database.

**Why it's wrong:** Discord metadata has tight size limits (channel topic: 1024 chars). Thread archival destroys context. You lose history on restart. You can't query or analyze it.

**Do this instead:** Use PostgreSQL for persistent session storage. Keep the in-memory Map as a cache layer. Discord is the interface, not the database.

### Anti-Pattern 4: One LLM Call Per Operation

**What people do:** Making a single LLM call that tries to generate reply, extract items, and handle corrections all at once.

**Why it's wrong:** Putting multiple responsibilities in one prompt degrades quality on all dimensions. The model optimizes for the primary task (reply) and neglects extraction. Extraction quality suffers, and corrections become inconsistent.

**Do this instead:** Separate concerns: high-tier model for conversation + corrections (they're related tasks), low-tier model for extraction (cheaper, focused prompt). Two calls, each with a specific, focused prompt.

### Anti-Pattern 5: Storing FSRS Card State Only In-Memory

**What people do:** Creating FSRS cards, scheduling, and never persisting the card state to a database.

**Why it's wrong:** ts-fsrs `Card` objects contain all scheduling state (`due`, `stability`, `difficulty`, `state`). Lose the card, lose all scheduling history. On restart, every card resets to a new card — all learning progress is destroyed.

**Do this instead:** Persist the full `Card` object to PostgreSQL after every scheduling operation. Serialize numeric fields directly (ts-fsrs Card fields are JSON-serializable). Load from DB before scheduling, write back after.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Discord Gateway** | WebSocket via discord.js Client | Requires privileged intents (`MessageContent`, `GuildMessages`). Bot token from env. Rate limits handled by library. |
| **OpenAI API** | REST via `openai` npm SDK | High-tier: GPT-4o, Low-tier: GPT-4o-mini. Key from env. Implement retry with exponential backoff (429/500 errors). |
| **Anthropic API** | REST via `@anthropic-ai/sdk` | High-tier: Claude 3.5 Sonnet. Key from env. Same retry pattern. |
| **PostgreSQL** | TCP via Prisma Client (pooled) | Connection string from env. Pool size: 10 (default). Prisma handles connection lifecycle. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Event/Command ↔ Service** | Direct method call (in-process) | Command handler extracts params from interaction, calls service method, formats response |
| **Service ↔ Repository** | Direct method call (in-process) | Services depend on repository interfaces, not Prisma directly |
| **Service ↔ LLM Service** | Direct method call (in-process) | `LlmService` methods are async — services await them. Consider timeout wrapping. |
| **Service ↔ SRS Engine** | Direct function call (in-process) | ts-fsrs is synchronous + pure. No async boundary needed. |
| **Repository ↔ Prisma** | Prisma Client queries | Repositories own the Prisma query surface. Services never import `@prisma/client`. |

## Sources

- [discord.js v14 official guide — command handling](https://discordjs.guide/app-creation/handling-commands.html)
- [discord.js v14 documentation](https://discord.js.org/docs)
- [ts-fsrs npm package (v5.4.1)](https://www.npmjs.com/package/ts-fsrs) — 685 stars, zero dependencies
- [Prisma ORM documentation](https://www.prisma.io/docs/orm)
- [Prisma Repository Pattern with TypeScript — Alex Rusin](https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma)
- [Building an AI-Powered Discord Bot — Ayush Sharma (Sep 2025)](https://medium.com/@ayushsh762/building-an-ai-powered-discord-bot-a-deep-dive-into-modern-architecture-and-technologies-3a98b781637b)
- [FutureHax Discord Bot Template — multi-service architecture](https://github.com/FutureHax/discord-bot-template)
- [Discord Bot Architecture for Scale — MGT Build Log (Mar 2026)](https://www.moderngrindtech.com/blog/discord-bot-architecture-scale)
- [Clean Architecture with Prisma — Arnaud Renaud](https://www.arnaudrenaud.com/articles/clean-architecture-typescript-prisma-next)

---
*Architecture research for: Language Partner Bot (AI Discord Language Learning)*
*Researched: 2026-07-07*
