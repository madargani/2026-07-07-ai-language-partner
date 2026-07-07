import { vi, afterEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// ──────────────────────────────────────────────────
// Mock PrismaClient
// ──────────────────────────────────────────────────

type PrismaMock = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
};

export const mockPrisma: PrismaMock = {
  user: {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(null),
  },
};

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

// ──────────────────────────────────────────────────
// Mock discord.js classes
// ──────────────────────────────────────────────────

vi.mock('discord.js', async () => {
  const actual = await vi.importActual<typeof import('discord.js')>('discord.js');
  return {
    ...actual,
    Client: vi.fn(() => ({
      on: vi.fn(),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn().mockResolvedValue(undefined),
    })),
    SlashCommandBuilder: actual.SlashCommandBuilder,
    CommandInteraction: vi.fn(),
  };
});

// ──────────────────────────────────────────────────
// Default test environment variables
// ──────────────────────────────────────────────────

process.env.DISCORD_TOKEN = 'test-token';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NODE_ENV = 'test';

// ──────────────────────────────────────────────────
// Clean up after each test
// ──────────────────────────────────────────────────

afterEach(() => {
  vi.clearAllMocks();
});
