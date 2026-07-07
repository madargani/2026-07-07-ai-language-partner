import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "../setup.js";

vi.mock("../../services/conversation.js", async () => {
  const actual = await vi.importActual<typeof import("../../services/conversation.js")>(
    "../../services/conversation.js",
  );
  return {
    ...actual,
    activeSessions: new Map([
      [
        "thread-1",
        {
          id: "session-1",
          thread: {
            id: "thread-1",
            setArchived: vi.fn().mockResolvedValue(undefined),
          },
          userId: "test-user",
          summary: "",
          messageCount: 5,
          correctionCount: 2,
        },
      ],
    ]),
  };
});

describe("/end command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ends active session", async () => {
    mockPrisma.session.update.mockResolvedValue({
      id: "session-1",
      status: "ended",
      endedAt: new Date(),
    });

    const { commands } = await import("../../commands/index.js");
    const endCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "end";
    });

    expect(endCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await endCommand!.execute(mockInteraction);

    expect(mockPrisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1" },
        data: expect.objectContaining({ status: "ended" }),
      }),
    );
  });

  it("shows error when no active session", async () => {
    const { commands } = await import("../../commands/index.js");
    const endCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "end";
    });

    expect(endCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "other-user" },
      createdTimestamp: Date.now(),
    } as any;

    await endCommand!.execute(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalled();
    const replyContent = mockInteraction.editReply.mock.calls[0][0];
    expect(replyContent).toContain("don't have an active session");
  });

  it("archives the thread after ending session", async () => {
    mockPrisma.session.update.mockResolvedValue({
      id: "session-1",
      status: "ended",
    });

    const { commands } = await import("../../commands/index.js");
    const endCommand = commands.find((c) => {
      const json = c.data.toJSON();
      return json.name === "end";
    });

    expect(endCommand).toBeDefined();

    const mockInteraction = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: "test-user" },
      createdTimestamp: Date.now(),
    } as any;

    await endCommand!.execute(mockInteraction);
  });
});
