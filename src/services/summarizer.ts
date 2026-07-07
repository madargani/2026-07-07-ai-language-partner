import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { ThreadChannel } from "discord.js";
import { encoding_for_model } from "tiktoken";
import { prisma } from "../lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUMMARIZE_PROMPT = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "conversation", "summarize.md"),
  "utf-8",
);

const openai = new OpenAI();

const TOKEN_THRESHOLD = 100_000;
const MAX_OUTPUT_TOKENS = 16_384;
const SAFETY_MARGIN = 1_024;
const SUMMARIZE_AT = TOKEN_THRESHOLD - MAX_OUTPUT_TOKENS - SAFETY_MARGIN;

export function shouldSummarize(
  contextMessages: { role: string; content: string }[],
  turnCount: number,
): boolean {
  if (turnCount <= 5) return false;

  const enc = encoding_for_model("gpt-4o-mini");
  let totalTokens = 0;

  for (const msg of contextMessages) {
    totalTokens += enc.encode(msg.content).length + 4;
  }

  enc.free();

  return totalTokens > SUMMARIZE_AT;
}

export async function triggerSummarization(
  sessionId: string,
  thread: ThreadChannel,
): Promise<void> {
  const messages: { id: string; role: string; content: string }[] =
    await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

  const conversationText = messages
    .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
    .join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SUMMARIZE_PROMPT },
      { role: "user", content: conversationText },
    ],
    max_tokens: 500,
  });

  const newSummary = `[${new Date().toISOString()}] ${
    completion.choices[0]?.message?.content ?? ""
  }`;

  await prisma.session.update({
    where: { id: sessionId },
    data: { summary: newSummary },
  });

  const lastTen: { id: string; role: string; content: string }[] = messages.slice(-10);
  const deleteIds = messages
    .filter(
      (m: { id: string; role: string; content: string }) =>
        !lastTen.some((lt: { id: string }) => lt.id === m.id),
    )
    .map((m: { id: string }) => m.id);

  if (deleteIds.length > 0) {
    await prisma.message.deleteMany({
      where: {
        sessionId,
        id: { in: deleteIds },
      },
    });
  }
}
