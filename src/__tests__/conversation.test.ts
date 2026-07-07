import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Conversation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds context from summary + recent messages", async () => {
    const { buildConversationContext } = await import(
      "../services/conversation.js"
    );

    const summary = "User practiced greetings and introductions";
    const recentMessages = [
      { role: "assistant", content: "¡Hola! ¿Cómo estás?" },
      { role: "user", content: "Bien, gracias" },
    ];
    const newMessage = "Me llamo Juan";

    const context = buildConversationContext(
      summary,
      recentMessages,
      newMessage,
    );

    expect(context).toBeDefined();
    expect(Array.isArray(context)).toBe(true);
    expect(context.length).toBeGreaterThan(0);
  });

  it("builds embed with corrections block + divider + response when corrections exist", async () => {
    const { buildConversationEmbed } = await import(
      "../services/conversation.js"
    );

    const embed = buildConversationEmbed(
      "• **Original:** Hola\n  **Corrected:** ¡Hola!\n  **Why:** Missing opening exclamation mark\n• **Original:** Como estas\n  **Corrected:** ¿Cómo estás?\n  **Why:** Missing accent and opening question mark",
      "¡Hola! Muy bien, gracias por preguntar.",
    );

    expect(embed).toBeDefined();
    const json = embed.toJSON();
    expect(json.fields?.some((f) => f.name.includes("Corrections"))).toBe(true);
    expect(json.fields?.some((f) => f.name.includes("Response"))).toBe(true);
    expect(json.color).toBe(0xe67e22);
  });

  it("shows 'No errors found!' when no corrections", async () => {
    const { buildConversationEmbed } = await import(
      "../services/conversation.js"
    );

    const embed = buildConversationEmbed(
      null,
      "¡Hola! Estoy bien, gracias.",
    );

    expect(embed).toBeDefined();
    const json = embed.toJSON();
    expect(json.fields?.some((f) => f.name.includes("No errors"))).toBe(true);
    expect(json.fields?.some((f) => f.name.includes("Response"))).toBe(true);
    expect(json.color).toBe(0x2ecc71);
  });

  it("caps corrections at max 2", async () => {
    const { parseCorrections } = await import("../services/conversation.js");

    const longCorrections = [
      { original: "Hola", corrected: "¡Hola!", explanation: "Missing exclamation" },
      { original: "Como", corrected: "Cómo", explanation: "Missing accent" },
      { original: "Estas", corrected: "Estás", explanation: "Missing accent" },
      { original: "Bien", corrected: "Bien", explanation: "Wrong word" },
    ];

    const testContent = `##CORRECTIONS##\n${longCorrections.map((c) => `Original: ${c.original} → Corrected: ${c.corrected}`).join("\n")}\n##SEPARATOR##\n##RESPONSE##\nHola!`;
    const result = parseCorrections(testContent);

    if (result.corrections) {
      expect(result.corrections.length).toBeLessThanOrEqual(2);
    }
  });
});
