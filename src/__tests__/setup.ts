import { afterEach, vi } from "vitest";

// ──────────────────────────────────────────────────
// Mock PrismaClient (using vi.hoisted to avoid hoisting issues)
// ──────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  type PrismaMock = {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    session: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    message: {
      create: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    reviewItem: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    sessionSummary: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const mock: PrismaMock = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(null),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: "session-1", status: "active", discordThreadId: "thread-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    message: {
      create: vi.fn().mockResolvedValue(null),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    reviewItem: {
      create: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    sessionSummary: {
      create: vi.fn().mockResolvedValue({ id: "ss-1", sessionId: "session-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    $connect: vi.fn().mockResolvedValue(undefined),
    $on: vi.fn(),
  } as any;

  return { mockPrisma: mock };
});

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(function () {
    return mockPrisma;
  }),
}));

// ──────────────────────────────────────────────────
// Mock discord.js classes
// ──────────────────────────────────────────────────

vi.mock("bullmq", () => ({
  Queue: vi.fn(function () {
    return {
      add: vi.fn().mockResolvedValue({ id: "job-1" }),
      drain: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
  Worker: vi.fn(function () {
    return {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock("ioredis", () => {
  return {
    default: vi.fn(function () {
      return {
        on: vi.fn(),
        quit: vi.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: vi.fn((schema, name) => ({ type: "json_schema", json_schema: { schema, name } })),
}));

vi.mock("discord.js", async () => {
  const actual =
    await vi.importActual<typeof import("discord.js")>("discord.js");
  return {
    ...actual,
    Client: vi.fn(() => ({
      on: vi.fn(),
      login: vi.fn().mockResolvedValue("token"),
      destroy: vi.fn().mockResolvedValue(undefined),
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: "thread-1",
          isThread: () => true,
          setArchived: vi.fn().mockResolvedValue(undefined),
          send: vi.fn().mockResolvedValue(undefined),
          joinable: true,
          join: vi.fn().mockResolvedValue(undefined),
          members: { add: vi.fn().mockResolvedValue(undefined) },
        }),
      },
    })),
    SlashCommandBuilder: actual.SlashCommandBuilder,
    CommandInteraction: vi.fn(),
  };
});

// ──────────────────────────────────────────────────
// Default test environment variables
// ──────────────────────────────────────────────────

process.env.DISCORD_TOKEN = "test-token";
process.env.DISCORD_CLIENT_ID = "test-client-id";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.NODE_ENV = "test";

// ──────────────────────────────────────────────────
// Export mockPrisma for test access
// ──────────────────────────────────────────────────

export { mockPrisma };

// ──────────────────────────────────────────────────
// Clean up after each test
// ──────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
});
