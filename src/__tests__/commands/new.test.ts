import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "../setup.js";

const mockOpenAICreate = vi.fn().mockResolvedValue({
  choices: [
    {
      message: {
        content:
          "##CORRECTIONS##\n\n##RESPONSE##\n¡Hola! ¿Cómo estás?",
      },
    },
  ],
});

vi.mock("openai", () => {
  function MockOpenAI() {
    return {
      chat: {
        completions: {
          create: mockOpenAICreate,
        },
      },
    };
  }
  return {
    default: MockOpenAI,
    OpenAI: MockOpenAI,
  };
});

const mockThread = {
  id: "thread-1",
  send: vi.fn().mockResolvedValue(undefined),
  joinable: true,
  join: vi.fn().mockResolvedValue(undefined),
  members: {
    add: vi.fn().mockResolvedValue(undefined),
  },
  setArchived: vi.fn().mockResolvedValue(undefined),
};

vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>("discord.js");
  return {
    ...actual,
    ChannelType: actual.ChannelType,
    ThreadAutoArchiveDuration: actual.ThreadAutoArchiveDuration,
    MessageFlags: actual.MessageFlags,
  };
});

describe("/new command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates private thread and sends greeting for configured user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      discordId: "test-user",
      nativeLanguage: "en",
      targetLanguage: "es",
      configured: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.session.create.mockResolvedValue({
      id: "session-1",
      status: "active",
      discordThreadId: "thread-1",
    });

    const { commands } = await import("../../commands/index.js");
    const newCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "new";
    });

    expect(newCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      channel: {
        threads: {
          create: vi.fn().mockResolvedValue(mockThread),
        },
      },
      options: {
        getString: vi.fn().mockReturnValue("My Spanish Practice"),
      },
      createdTimestamp: Date.now(),
    } as any;

    await newCommand!.execute(mockInteraction);

    expect(mockInteraction.channel.threads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "My Spanish Practice",
        type: expect.any(Number),
      }),
    );
    expect(mockThread.join).toHaveBeenCalled();
    expect(mockThread.members.add).toHaveBeenCalledWith("test-user");
    expect(mockThread.send).toHaveBeenCalled();
  });

  it("uses date-based fallback name when no session_name provided", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      discordId: "test-user",
      nativeLanguage: "en",
      targetLanguage: "es",
      configured: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { commands } = await import("../../commands/index.js");
    const newCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "new";
    });

    expect(newCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      channel: {
        threads: {
          create: vi.fn().mockResolvedValue(mockThread),
        },
      },
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
      createdTimestamp: Date.now(),
    } as any;

    await newCommand!.execute(mockInteraction);

    expect(mockInteraction.channel.threads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
      }),
    );
  });

  it("requires /setup for unconfigured user", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      discordId: "test-user",
      nativeLanguage: null,
      targetLanguage: null,
      configured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { commands } = await import("../../commands/index.js");
    const newCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "new";
    });

    expect(newCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      channel: {
        threads: {
          create: vi.fn(),
        },
      },
      options: {
        getString: vi.fn().mockReturnValue(null),
      },
      createdTimestamp: Date.now(),
    } as any;

    await newCommand!.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
    const replyContent = mockInteraction.editReply.mock.calls[0][0];
    expect(replyContent).toContain("setup");
    expect(mockInteraction.channel.threads.create).not.toHaveBeenCalled();
  });
});
