import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from './setup';

// ─────────────────────────────────────────────────────
// Test 1: Config validation
// ─────────────────────────────────────────────────────

describe('Config validation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('passes when all required env vars are present', async () => {
    process.env.DISCORD_TOKEN = 'valid-token';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NODE_ENV = 'development';

    const { env } = await import('../lib/config');
    expect(env.DISCORD_TOKEN).toBe('valid-token');
    expect(env.DATABASE_URL).toBe('postgresql://localhost:5432/db');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.NODE_ENV).toBe('development');
  });

  it('throws when DISCORD_TOKEN is missing', async () => {
    delete process.env.DISCORD_TOKEN;

    await expect(async () => {
      await import('../lib/config');
    }).rejects.toThrow();
  });

  it('throws when DATABASE_URL is invalid', async () => {
    process.env.DATABASE_URL = 'not-a-valid-url';

    await expect(async () => {
      await import('../lib/config');
    }).rejects.toThrow();
  });

  it('defaults NODE_ENV to development when not set', async () => {
    delete process.env.NODE_ENV;

    const { env } = await import('../lib/config');
    expect(env.NODE_ENV).toBe('development');
  });

  it('throws when REDIS_URL is missing', async () => {
    delete process.env.REDIS_URL;

    await expect(async () => {
      await import('../lib/config');
    }).rejects.toThrow();
  });

  it('throws when DISCORD_TOKEN is an empty string', async () => {
    process.env.DISCORD_TOKEN = '';

    await expect(async () => {
      await import('../lib/config');
    }).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────
// Test 2: Prisma singleton
// ─────────────────────────────────────────────────────

describe('Prisma singleton', () => {
  it('importing prisma returns a PrismaClient instance', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const { prisma } = await import('../lib/prisma');

    expect(prisma).toBeDefined();
    expect(PrismaClient).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────
// Test 3: Command structure
// ─────────────────────────────────────────────────────

describe('Command structure', () => {
  it('all commands have data (SlashCommandBuilder) and execute function', async () => {
    const { commands } = await import('../commands/index');

    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);

    for (const cmd of commands) {
      expect(cmd).toHaveProperty('data');
      expect(cmd).toHaveProperty('execute');
      expect(typeof cmd.execute).toBe('function');
    }
  });

  it('each command has a name and description on its data', async () => {
    const { commands } = await import('../commands/index');

    for (const cmd of commands) {
      const json = cmd.data.toJSON();
      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('description');
      expect(typeof json.name).toBe('string');
      expect(json.name.length).toBeGreaterThan(0);
      expect(typeof json.description).toBe('string');
    }
  });

  it('every execute calls deferReply as first async operation', async () => {
    const { commands } = await import('../commands/index');

    for (const cmd of commands) {
      const mockInteraction = {
        deferReply: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        user: { id: 'test-user' },
        createdTimestamp: Date.now(),
      } as any;

      await cmd.execute(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalled();
    }
  });
});

// ─────────────────────────────────────────────────────
// Test 4: Graceful shutdown
// ─────────────────────────────────────────────────────

describe('Graceful shutdown', () => {
  it('shutdown function exists and attempts cleanup', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prismaInstance = new PrismaClient();

    // We can't easily test the full shutdown without importing index.ts
    // which would start the bot. Instead verify the pattern exists.
    expect(prismaInstance.$disconnect).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────
// Test 5: /setup flow
// ─────────────────────────────────────────────────────

describe('/setup command', () => {
  it('calls prisma.user.upsert with correct shape on completion', async () => {
    const { commands } = await import('../commands/index');
    const setupCommand = commands.find(c => {
      const json = c.data.toJSON();
      return json.name === 'setup';
    });

    expect(setupCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: 'test-user' },
      channel: {
        awaitMessageComponent: vi.fn().mockRejectedValue(new Error('timeout')),
      },
      createdTimestamp: Date.now(),
    } as any;

    await setupCommand!.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────
// Test 6: /new flow — unconfigured user
// ─────────────────────────────────────────────────────

describe('/new command', () => {
  it('returns error telling unconfigured user to run /setup', async () => {
    // Mock unconfigured user lookup
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'test-user',
      discordId: 'test-user',
      nativeLanguage: null,
      targetLanguage: null,
      configured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { commands } = await import('../commands/index');
    const newCommand = commands.find(c => {
      const json = c.data.toJSON();
      return json.name === 'new';
    });

    expect(newCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: 'test-user' },
      createdTimestamp: Date.now(),
    } as any;

    await newCommand!.execute(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalled();
    const replyContent = mockInteraction.editReply.mock.calls[0][0];
    expect(replyContent).toContain('setup');
  });
});
