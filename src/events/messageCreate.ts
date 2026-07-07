import type { Client, Message } from "discord.js";
import { activeSessions, handleConversationMessage } from "../services/conversation.js";

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
    } catch (error) {
      console.error("Error handling conversation message:", error);
    }
  });
}
