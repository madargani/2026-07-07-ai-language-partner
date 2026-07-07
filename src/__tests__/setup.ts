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
  };

  const mock: PrismaMock = {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(null),
    },
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

vi.mock("discord.js", async () => {
  const actual =
    await vi.importActual<typeof import("discord.js")>("discord.js");
  return {
    ...actual,
    Client: vi.fn(() => ({
      on: vi.fn(),
      login: vi.fn().mockResolvedValue("token"),
      destroy: vi.fn().mockResolvedValue(undefined),
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
