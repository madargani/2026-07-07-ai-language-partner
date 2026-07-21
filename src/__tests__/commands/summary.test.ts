import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "../setup.js";

// Mock the FSRS service for getQueueHealth
vi.mock("../../services/fsrs.js", () => ({
  getQueueHealth: vi.fn().mockResolvedValue(5),
}));

// Mock OpenAI for analyzeStrengths
const { mockOpenAI } = vi.hoisted(() => {
  const createMock = vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify([
            { term: "Past tense conjugations", explanation: "Used 'comí' and 'bebiste' correctly" },
            { term: "Restaurant vocabulary", explanation: "Correctly ordered food using 'quisiera' and 'la cuenta'" },
            { term: "Ser vs Estar", explanation: "Used 'es' for description and 'está' for location properly" },
          ]),
        },
      },
    ],
  });

  return {
    mockOpenAI: class {
      chat = {
        completions: {
          create: createMock,
        },
      };
    },
  };
});

vi.mock("openai", () => ({
  default: mockOpenAI,
}));

const mockThread = {
  id: "thread-1",
  setArchived: vi.fn().mockResolvedValue(undefined),
};

async function setupActiveSession() {
  const { activeSessions } = await import("../../services/conversation.js");
  activeSessions.clear();
  activeSessions.set("thread-1", {
    id: "session-1",
    thread: mockThread as any,
    userId: "test-user",
    summary: "User discussed weekend plans and ordering food.",
    messageCount: 8,
    correctionCount: 3,
  });
}

describe("/summary command", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default mock setup
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      createdAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      summary: "User discussed weekend plans and ordering food.",
    });

    mockPrisma.message.findMany.mockResolvedValue([
      { id: "m1", sessionId: "session-1", role: "assistant", content: "¡Hola! ¿Cómo estás?" },
      { id: "m2", sessionId: "session-1", role: "user", content: "Bien, gracias. Ayer yo fui al parque." },
      { id: "m3", sessionId: "session-1", role: "assistant", content: "¡Qué bien! ¿Fuiste con amigos?" },
    ]);

    mockPrisma.reviewItem.count.mockResolvedValue(3);
    mockPrisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
  });

  it("shows error when no active session", async () => {
    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "summary";
    });

    expect(cmd).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "other-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
    expect(mockInteraction.editReply.mock.calls[0][0]).toContain("don't have an active session");
  });

  it("displays existing fields (Messages, Corrections, Duration)", async () => {
    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "summary";
    });

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const fields = embed.data.fields;
    const messagesField = fields.find((f: any) => f.name === "Messages");
    const correctionsField = fields.find((f: any) => f.name === "Corrections");
    const durationField = fields.find((f: any) => f.name === "Duration");

    expect(messagesField).toBeDefined();
    expect(messagesField.value).toBe("8");
    expect(correctionsField).toBeDefined();
    expect(correctionsField.value).toBe("3");
    expect(durationField).toBeDefined();
  });

  it("displays top 3 strengths (SUMM-02)", async () => {
    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => c.data.toJSON().name === "summary");

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const strengthsField = embed.data.fields.find((f: any) => f.name === "🏆 Top Strengths");

    expect(strengthsField).toBeDefined();
    expect(strengthsField.value).toContain("Past tense conjugations");
    expect(strengthsField.value).toContain("Restaurant vocabulary");
    expect(strengthsField.value).toContain("Ser vs Estar");
  });

  it("shows fallback text when session too short for strengths", async () => {
    // Override message mock to return fewer than 2 messages
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "m1", sessionId: "session-1", role: "assistant", content: "Hello" },
    ]);

    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => c.data.toJSON().name === "summary");

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const strengthsField = embed.data.fields.find((f: any) => f.name === "🏆 Top Strengths");

    expect(strengthsField).toBeDefined();
    expect(strengthsField.value).toContain("Session too short to analyze");
  });

  it("displays expansion metrics count (SUMM-03)", async () => {
    mockPrisma.reviewItem.count.mockResolvedValue(3);
    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => c.data.toJSON().name === "summary");

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const newItemsField = embed.data.fields.find((f: any) => f.name === "📈 New Items");

    expect(newItemsField).toBeDefined();
    expect(newItemsField.value).toBe("3 extracted");
  });

  it("displays queue health count (SUMM-04)", async () => {
    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => c.data.toJSON().name === "summary");

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    const embed = mockInteraction.editReply.mock.calls[0][0].embeds[0];
    const queueField = embed.data.fields.find((f: any) => f.name === "📚 Queue");

    expect(queueField).toBeDefined();
    expect(queueField.value).toBe("5 due in 24h");
  });

  it("persists SessionSummary to PostgreSQL (SUMM-05)", async () => {
    mockPrisma.sessionSummary.create.mockResolvedValue({
      id: "ss-1",
      sessionId: "session-1",
    });

    await setupActiveSession();

    const { commands } = await import("../../commands/index.js");
    const cmd = commands.find((c) => c.data.toJSON().name === "summary");

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await cmd!.execute(mockInteraction);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    // Verify SessionSummary.create was called inside the transaction
    expect(mockPrisma.sessionSummary.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "session-1",
          expandedCount: expect.any(Number),
          queueHealth: expect.any(Number),
        }),
      }),
    );
  });
});
