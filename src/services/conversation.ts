import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import {
  ChannelType,
  EmbedBuilder,
  ThreadAutoArchiveDuration,
  type ChatInputCommandInteraction,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import type { Client } from "discord.js";
import { env } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import type { ActiveSession, ParseCorrectionsResult } from "../types/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const openai = new OpenAI();
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "system.md"),
  "utf-8",
);

export const activeSessions = new Map<string, ActiveSession>();

export function buildConversationContext(
  summary: string,
  recentMessages: { role: string; content: string }[],
  newMessage: string,
): ChatCompletionMessageParam[] {
  const context: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (summary) {
    context.push({
      role: "system",
      content: `Summary of earlier conversation: ${summary}`,
    });
  }

  for (const msg of recentMessages) {
    context.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  context.push({ role: "user", content: newMessage });

  return context;
}

export function parseCorrections(content: string): ParseCorrectionsResult {
  const parts = content.split("##SEPARATOR##");
  const correctionsSection =
    parts[0]?.replace("##CORRECTIONS##", "").trim() ?? "";
  const responseSection =
    parts[1]?.replace("##RESPONSE##", "").trim() ?? content.trim();

  if (!correctionsSection || correctionsSection === "No errors found!") {
    return { corrections: null, response: responseSection };
  }

  const corrections: {
    original: string;
    corrected: string;
    explanation: string;
  }[] = [];
  const lines = correctionsSection.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (corrections.length >= 2) break;

    const match = trimmed.match(
      /Original:\s*(.+?)\s*→\s*Corrected:\s*(.+?)(?:\s*$|\s*-\s*(.+))/,
    );
    if (match) {
      corrections.push({
        original: match[1]!.trim(),
        corrected: match[2]!.trim(),
        explanation: (match[3] ?? "").trim(),
      });
    }
  }

  return {
    corrections: corrections.length > 0 ? corrections : null,
    response: responseSection,
  };
}

export function buildConversationEmbed(
  corrections: string | null,
  response: string,
): EmbedBuilder {
  const embed = new EmbedBuilder().setTimestamp();

  if (corrections) {
    embed.setColor(0xe67e22);
    embed.addFields({ name: "📝 Corrections", value: corrections });
    embed.addFields({ name: "\u200B", value: "\u2015".repeat(20) });
  } else {
    embed.setColor(0x2ecc71);
    embed.addFields({
      name: "✅ No errors found!",
      value: "Great job! Keep going!",
    });
    embed.addFields({ name: "\u200B", value: "\u2015".repeat(20) });
  }

  embed.addFields({ name: "💬 Response", value: response });

  return embed;
}

export async function createSession(
  interaction: ChatInputCommandInteraction,
  sessionName?: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
  });

  if (!user?.configured) {
    await interaction.editReply(
      "⚠️ You need to configure your languages first! Please run `/setup` to set your native and target languages.",
    );
    return;
  }

  const channel = interaction.channel;
  if (!channel || !("threads" in channel)) {
    await interaction.editReply(
      "Could not find the channel to create a thread.",
    );
    return;
  }

  const textChannel = channel as TextChannel;

  const threadName =
    sessionName ?? new Date().toISOString().split("T")[0]!;

  const thread = await textChannel.threads.create({
    name: threadName,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
    reason: `New conversation session for ${interaction.user.tag}`,
  });

  if (thread.joinable) {
    await thread.join();
  }

  await thread.members.add(interaction.user.id);

  const greeting = await generateGreeting(user.targetLanguage);

  await thread.send(greeting);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      discordThreadId: thread.id,
      status: "active",
    },
  });

  await prisma.message.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: greeting,
    },
  });

  activeSessions.set(thread.id, {
    id: session.id,
    thread: thread as ThreadChannel,
    userId: interaction.user.id,
    summary: "",
    messageCount: 1,
    correctionCount: 0,
  });

  await interaction.editReply(
    "✅ Session started! Check your private thread.",
  );
}

async function generateGreeting(targetLanguage: string): Promise<string> {
  const langPrompt = `Generate a warm, natural greeting in ${targetLanguage} for a language learner starting a conversation practice session. Keep it friendly and beginner-appropriate (1-2 sentences). Do NOT include any corrections, just the greeting.`;

  const completion = await openai.chat.completions.create({
    model: env.EXTRACTION_MODEL,
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: langPrompt },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  return (
    completion.choices[0]?.message?.content ?? "¡Hola! ¿Cómo estás hoy?"
  );
}

export async function handleConversationMessage(
  thread: ThreadChannel,
  userId: string,
  userMessage: string,
): Promise<void> {
  const session = activeSessions.get(thread.id);
  if (!session) return;

  const recentMessages = await prisma.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const contextMessages = buildConversationContext(
    session.summary,
    recentMessages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    userMessage,
  );

  const completion = await openai.chat.completions.create({
    model: env.CONVERSATION_MODEL,
    messages: contextMessages,
    temperature: 0.7,
    max_tokens: 1024,
  });

  const responseContent = completion.choices[0]?.message?.content ?? "";

  const { corrections, response } = parseCorrections(responseContent);

  const correctionsText = corrections
    ? corrections
        .map(
          (c) =>
            `• **Original:** ${c.original}\n  **Corrected:** ${c.corrected}\n  **Why:** ${c.explanation}`,
        )
        .join("\n\n")
    : null;

  const embed = buildConversationEmbed(correctionsText, response);

  await thread.send({ embeds: [embed] });

  await prisma.message.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: userMessage,
    },
  });

  await prisma.message.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: responseContent,
      hasCorrections: corrections !== null,
    },
  });

  session.messageCount += 1;
  if (corrections) {
    session.correctionCount += corrections.length;
  }

  await prisma.session.update({
    where: { id: session.id },
    data: {
      messageCount: session.messageCount,
      correctionCount: session.correctionCount,
    },
  });
}

export async function endSession(
  userId: string,
): Promise<{
  sessionId: string;
  stats: { messageCount: number; correctionCount: number };
} | null> {
  for (const [threadId, session] of activeSessions) {
    if (session.userId === userId) {
      activeSessions.delete(threadId);

      await prisma.session.update({
        where: { id: session.id },
        data: {
          status: "ended",
          endedAt: new Date(),
          messageCount: session.messageCount,
          correctionCount: session.correctionCount,
        },
      });

      try {
        await session.thread.setArchived(true);
      } catch {
        // Thread may already be archived
      }

      return {
        sessionId: session.id,
        stats: {
          messageCount: session.messageCount,
          correctionCount: session.correctionCount,
        },
      };
    }
  }

  return null;
}

export async function getSessionSummary(
  userId: string,
): Promise<{
  messageCount: number;
  correctionCount: number;
  summary: string;
  duration: string;
} | null> {
  for (const [_threadId, session] of activeSessions) {
    if (session.userId === userId) {
      const dbSession = await prisma.session.findUnique({
        where: { id: session.id },
      });

      if (!dbSession) return null;

      const startTime = dbSession.createdAt.getTime();
      const now = Date.now();
      const diffMs = now - startTime;
      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const minutes = diffMin % 60;
      const duration =
        hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;

      return {
        messageCount: session.messageCount,
        correctionCount: session.correctionCount,
        summary: dbSession.summary ?? "No summary available.",
        duration,
      };
    }
  }

  return null;
}

export async function rehydrateSessions(client: Client): Promise<void> {
  const activeSessionData = await prisma.session.findMany({
    where: { status: "active" },
    include: {
      user: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  let rehydratedCount = 0;

  for (const sessionData of activeSessionData) {
    try {
      const channel = await client.channels.fetch(
        sessionData.discordThreadId,
      );

      if (!channel?.isThread()) {
        await prisma.session.update({
          where: { id: sessionData.id },
          data: { status: "ended" },
        });
        continue;
      }

      const thread = channel as ThreadChannel;

      if (thread.archived) {
        await thread.setArchived(false);
      }

      activeSessions.set(sessionData.discordThreadId, {
        id: sessionData.id,
        thread,
        userId: sessionData.user.discordId,
        summary: sessionData.summary ?? "",
        messageCount: sessionData.messageCount,
        correctionCount: sessionData.correctionCount,
      });

      rehydratedCount++;
    } catch {
      await prisma.session.update({
        where: { id: sessionData.id },
        data: { status: "ended" },
      });
    }
  }

  console.log(`Rehydrated ${rehydratedCount} active sessions`);
}
