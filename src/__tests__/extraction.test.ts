import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockPrisma } from "./setup.js";
import {
  ExtractionJobPayloadSchema,
  ExtractionResultSchema,
  type ExtractionJobPayload,
} from "../types/extraction.js";

vi.mock("openai", () => {
  const mockParse = vi.fn();
  const OpenAI = vi.fn(function () {
    return {
      chat: {
        completions: {
          parse: mockParse,
        },
      },
    };
  });
  return { default: OpenAI, OpenAI };
});

vi.mock("fs", () => ({
  readFileSync: vi.fn().mockReturnValue(
    "You are an extraction assistant. Target: {{targetLanguage}}, Native: {{nativeLanguage}}.",
  ),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn().mockReturnValue(
    "You are an extraction assistant. Target: {{targetLanguage}}, Native: {{nativeLanguage}}.",
  ),
}));

import OpenAI from "openai";

const validJobPayload: ExtractionJobPayload = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  sessionId: "550e8400-e29b-41d4-a716-446655440001",
  messageContent: "Je suis fatigue",
  targetLanguage: "fr",
  nativeLanguage: "en",
  recentContext: "User: Bonjour\nAssistant: Bonjour! Comment vas-tu?",
};

function getMockParse() {
  const openai = new OpenAI();
  return (openai.chat.completions.parse as ReturnType<typeof vi.fn>);
}

describe("Extraction Schema Validation", () => {
  it("validates a correct extraction result", () => {
    const result = ExtractionResultSchema.parse({
      detectedItems: [
        { source: "fatigué", type: "vocabulary" },
        { source: "être + adjective agreement", type: "grammar" },
      ],
      typosIgnored: [],
    });
    expect(result.detectedItems).toHaveLength(2);
    expect(result.typosIgnored).toHaveLength(0);
  });

  it("rejects invalid detectedItems type", () => {
    expect(() =>
      ExtractionResultSchema.parse({
        detectedItems: [{ source: "test", type: "invalid" }],
        typosIgnored: [],
      }),
    ).toThrow();
  });

  it("rejects empty source string", () => {
    expect(() =>
      ExtractionResultSchema.parse({
        detectedItems: [{ source: "", type: "vocabulary" }],
        typosIgnored: [],
      }),
    ).toThrow();
  });

  it("accepts empty detectedItems array", () => {
    const result = ExtractionResultSchema.parse({
      detectedItems: [],
      typosIgnored: [],
    });
    expect(result.detectedItems).toEqual([]);
  });

  it("validates job payload with correct fields", () => {
    const result = ExtractionJobPayloadSchema.parse(validJobPayload);
    expect(result.userId).toBe(validJobPayload.userId);
    expect(result.messageContent).toBe("Je suis fatigue");
  });
});

describe("Extraction Worker — processExtractionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes extraction job payload and creates items for each detectedItem", async () => {
    const mockParse = getMockParse();
    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              detectedItems: [
                { source: "fatigué", type: "vocabulary" },
                { source: "être + adjective agreement", type: "grammar" },
              ],
              typosIgnored: [],
            },
            refusal: null,
          },
        },
      ],
    });

    mockPrisma.reviewItem.findFirst.mockResolvedValue(null);
    mockPrisma.reviewItem.create.mockResolvedValue({ id: "item-1" });

    const { processExtractionJob } = await import("../services/extraction.js");

    await processExtractionJob(validJobPayload);

    expect(mockPrisma.reviewItem.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.reviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: validJobPayload.userId,
          source: "fatigué",
          type: "vocabulary",
          language: "fr",
        }),
      }),
    );
  });

  it("handles null response from LLM gracefully", async () => {
    const mockParse = getMockParse();
    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: null,
            refusal: "I cannot process this",
          },
        },
      ],
    });

    mockPrisma.reviewItem.findFirst.mockReset();
    mockPrisma.reviewItem.create.mockClear();

    const { processExtractionJob } = await import("../services/extraction.js");

    await processExtractionJob(validJobPayload);

    expect(mockPrisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("skips duplicate items", async () => {
    const mockParse = getMockParse();
    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              detectedItems: [{ source: "bonjour", type: "vocabulary" }],
              typosIgnored: [],
            },
            refusal: null,
          },
        },
      ],
    });

    mockPrisma.reviewItem.findFirst.mockResolvedValue({ id: "existing-item" });
    mockPrisma.reviewItem.create.mockClear();

    const { processExtractionJob } = await import("../services/extraction.js");

    await processExtractionJob(validJobPayload);

    expect(mockPrisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("continues with remaining items when one createItem fails", async () => {
    const mockParse = getMockParse();
    mockParse.mockResolvedValue({
      choices: [
        {
          message: {
            parsed: {
              detectedItems: [
                { source: "merci", type: "vocabulary" },
                { source: "s'il vous plaît", type: "vocabulary" },
              ],
              typosIgnored: [],
            },
            refusal: null,
          },
        },
      ],
    });

    mockPrisma.reviewItem.findFirst.mockResolvedValue(null);
    mockPrisma.reviewItem.create
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({ id: "item-2" });

    const { processExtractionJob } = await import("../services/extraction.js");

    await expect(processExtractionJob(validJobPayload)).resolves.not.toThrow();
    expect(mockPrisma.reviewItem.create).toHaveBeenCalledTimes(2);
  });
});
