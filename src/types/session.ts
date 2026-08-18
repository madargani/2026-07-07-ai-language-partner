import type { ThreadChannel } from "discord.js";

export type SessionStatus = "active" | "ended" | "archived";
export type MessageRole = "user" | "assistant";

export interface ActiveSession {
  id: string;
  thread: ThreadChannel;
  userId: string;
  summary: string;
  messageCount: number;
  correctionCount: number;
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface ParseCorrectionsResult {
  corrections: Correction[] | null;
  response: string;
}
