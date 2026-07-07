import type { Command } from "../types/discord.js";
import { command as newCommand } from "./new.js";
import { command as pingCommand } from "./ping.js";
import { command as setupCommand } from "./setup.js";
import { command as endCommand } from "./end.js";
import { command as summaryCommand } from "./summary.js";

export const commands: Command[] = [
  pingCommand,
  setupCommand,
  newCommand,
  endCommand,
  summaryCommand,
];
