import type { Command } from "../types/discord.js";
import { command as newCommand } from "./new.js";
import { command as pingCommand } from "./ping.js";
import { command as setupCommand } from "./setup.js";

export const commands: Command[] = [pingCommand, setupCommand, newCommand];
