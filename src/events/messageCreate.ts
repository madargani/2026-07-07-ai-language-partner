import type { Client, Message } from "discord.js";
import { activeSessions, handleConversationMessage } from "../services/conversation.js";
import { extractionQueue } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";

async function enqueueExtraction(session: { id: string; userId: string }, message: Message) {
  try {
    const user = await prisma.user.findUnique({
      where: { discordId: session.userId },
    });

    if (!user) return;

    const recentMessages = await prisma.message.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { role: true, content: true },
    });

    const recentContext = recentMessages
      .reverse()
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");

    await extractionQueue.add(
      "extract",
      {
        userId: user.id,
        sessionId: session.id,
        messageContent: message.content,
        targetLanguage: user.targetLanguage,
        nativeLanguage: user.nativeLanguage,
        recentContext,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
    );
  } catch (error) {
    console.error("Failed to enqueue extraction job:", error);
  }
}

export function registerMessageCreateHandler(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;

    const channel = message.channel;
    if (!channel.isThread()) return;

    const session = activeSessions.get(channel.id);
    if (!session) return;

    if (message.author.id !== session.userId) return;

    try {
      await handleConversationMessage(channel, message.author.id, message.content);

      await enqueueExtraction(session, message);
    } catch (error) {
      console.error("Error handling conversation message:", error);
    }
  });
}
