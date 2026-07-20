import { z } from "zod";

export const ExtractionJobPayloadSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  messageContent: z.string().min(1).max(2000),
  targetLanguage: z.string().min(1),
  nativeLanguage: z.string().min(1),
  recentContext: z.string().max(5000),
});

export type ExtractionJobPayload = z.infer<typeof ExtractionJobPayloadSchema>;

export const ExtractionResultSchema = z.object({
  detectedItems: z.array(
    z.object({
      source: z.string().min(1),
      type: z.enum(["vocabulary", "grammar"]),
    }),
  ),
  typosIgnored: z.array(z.string()),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
