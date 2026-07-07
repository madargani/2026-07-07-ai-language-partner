import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma } from "./setup.js";

const mockActiveSession = {
  id: "session-1",
  discordThreadId: "thread-1",
  userId: "user-1",
  status: "active",
  summary: "Previous conversation summary",
  messageCount: 5,
  correctionCount: 2,
  createdAt: new Date(),
  endedAt: null,
  updatedAt: new Date(),
  messages: [
    {
      id: "msg-1",
      sessionId: "session-1",
      role: "assistant",
      content: "¡Hola!",
      hasCorrections: false,
      createdAt: new Date(),
    },
    {
      id: "msg-2",
      sessionId: "session-1",
      role: "user",
      content: "Bien, gracias",
      hasCorrections: false,
      createdAt: new Date(),
    },
  ],
};

describe("Session Rehydration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { activeSessions } = await import("../services/conversation.js");
    activeSessions.clear();
  });

  it("loads active sessions from DB on startup", async () => {
    mockPrisma.session.findMany.mockResolvedValue([mockActiveSession]);

    const { rehydrateSessions, activeSessions } = await import(
      "../services/conversation.js"
    );

    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: "thread-1",
          isThread: () => true,
          archived: false,
          setArchived: vi.fn().mockResolvedValue(undefined),
        }),
      },
    } as any;

    await rehydrateSessions(mockClient);

    expect(mockPrisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "active" },
      }),
    );

    const session = activeSessions.get("thread-1");
    expect(session).toBeDefined();
    expect(session?.id).toBe("session-1");
    expect(session?.userId).toBe("user-1");
  });

  it("ends sessions whose threads were deleted", async () => {
    mockPrisma.session.findMany.mockResolvedValue([mockActiveSession]);

    const { rehydrateSessions, activeSessions } = await import(
      "../services/conversation.js"
    );

    const mockClient = {
      channels: {
        fetch: vi.fn().mockRejectedValue(new Error("Thread not found")),
      },
    } as any;

    await rehydrateSessions(mockClient);

    expect(mockPrisma.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1" },
        data: { status: "ended" },
      }),
    );

    expect(activeSessions.size).toBe(0);
  });

  it("skips non-active sessions", async () => {
    const endedSession = { ...mockActiveSession, status: "ended" };
    mockPrisma.session.findMany.mockResolvedValue([endedSession]);

    const { rehydrateSessions, activeSessions } = await import(
      "../services/conversation.js"
    );

    const mockClient = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          id: "thread-1",
          isThread: () => true,
          archived: false,
          setArchived: vi.fn().mockResolvedValue(undefined),
        }),
      },
    } as any;

    await rehydrateSessions(mockClient);

    expect(activeSessions.size).toBe(0);
  });
});
