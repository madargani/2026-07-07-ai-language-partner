import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "../setup.js";

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
    summary: "",
    messageCount: 5,
    correctionCount: 2,
  });
}

describe("/end command", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("ends active session", async () => {
    mockPrisma.session.update.mockResolvedValue({
      id: "session-1",
      status: "ended",
      endedAt: new Date(),
    });

    await setupActiveSession();

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

    await setupActiveSession();

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

    expect(mockThread.setArchived).toHaveBeenCalledWith(true);
  });
});
