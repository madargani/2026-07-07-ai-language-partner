import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { env } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { createItem } from "./fsrs.js";
import {
  ExtractionResultSchema,
  type ExtractionJobPayload,
} from "../types/extraction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemPrompt = readFileSync(
  join(__dirname, "..", "prompts", "extraction", "system.md"),
  "utf-8",
);

const openai = new OpenAI();

export async function processExtractionJob(
  data: ExtractionJobPayload,
): Promise<void> {
  const filledPrompt = systemPrompt
    .replace("{{targetLanguage}}", data.targetLanguage)
    .replace("{{nativeLanguage}}", data.nativeLanguage);

  const userMessage = data.recentContext
    ? `Recent conversation:\n${data.recentContext}\n\nNew message: ${data.messageContent}`
    : data.messageContent;

  const response = await openai.chat.completions.parse({
    model: env.EXTRACTION_MODEL,
    messages: [
      { role: "system", content: filledPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: zodResponseFormat(ExtractionResultSchema, "extraction"),
    temperature: 0.1,
    max_tokens: 300,
  }, { timeout: 15_000 });

  const parsed = response.choices?.[0]?.message?.parsed;

  if (!parsed) {
    const refusal = response.choices?.[0]?.message?.refusal;
    console.warn("Extraction LLM refused or returned null:", refusal ?? "unknown");
    return;
  }

  if (parsed.typosIgnored?.length) {
    console.log("Extraction typos ignored:", parsed.typosIgnored.join(", "));
  }

  for (const item of parsed.detectedItems) {
    try {
      const existing = await prisma.reviewItem.findFirst({
        where: {
          userId: data.userId,
          source: item.source,
          type: item.type,
        },
      });

      if (existing) {
        console.log("Skipping duplicate item:", item.source, item.type);
        continue;
      }

      await createItem({
        userId: data.userId,
        source: item.source,
        type: item.type,
        language: data.targetLanguage,
        sessionId: data.sessionId,    // per D-07: stamp from job payload
      });
    } catch (err) {
      console.error("Failed to create item:", item.source, err);
    }
  }
}
