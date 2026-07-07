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

  it("parses all corrections (no hard cap)", async () => {
    const { parseCorrections } = await import("../services/conversation.js");

    const testContent = `##CORRECTIONS##
Original: Estas → Corrected: Estás - Missing accent
Original: Bien → Corrected: Bien - Wrong word
Original: library → Corrected: biblioteca - Code-switching
##SEPARATOR##
##RESPONSE##
Hola!`;
    const result = parseCorrections(testContent);

    expect(result.corrections).toBeDefined();
    expect(result.corrections!.length).toBe(3);
  });
});
