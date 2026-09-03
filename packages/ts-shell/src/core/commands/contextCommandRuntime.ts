import type { CommandContext, LocalCommandResult } from "./types.js";
import { getSessionUsage } from "../../observability/usageTelemetry.js";
import { buildOpenAITools } from "../query/agentLoop.js";
import { createCoreToolRegistry } from "../tools/registry.js";

/**
 * /context — how much of the window the last request used.
 *
 * Only measured quantities appear here. The previous version presented a
 * breakdown table headed "Measured Tokens" whose rows were mostly invented: the
 * footprint fell back to a literal 2,500 when no turn had run, the system prompt
 * was "35% of the footprint, capped at 1,500", the tool schemas were a flat 1,200
 * described as "11 core & web tool parameter definitions", and history was
 * whatever was left after subtracting the other two. Numbers like that cannot be
 * checked, and a context report exists to be checked.
 *
 * What can be measured is measured: the tool schemas are serialised and counted
 * exactly as they go on the wire, and the prompt total comes from what the
 * provider reported for the last request. What is left over is named as a
 * remainder rather than split into invented parts.
 */

/** Characters per token, for text that has only been counted in characters. */
const CHARS_PER_TOKEN = 3.5;
const BAR_WIDTH = 32;

export async function runContextCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const sessionId = context.sessionId ?? "";
  const telemetry = sessionId ? getSessionUsage(sessionId) : undefined;
  const window = configuredWindow();
  const reserve = 8_000;
  const schemaTokens = toolSchemaTokens();
  const registry = createCoreToolRegistry();

  if (!telemetry || telemetry.lastPromptTokens <= 0) {
    return {
      kind: "local",
      output: [
        "### Context window",
        "",
        `- Window: ${window.toLocaleString()} tokens`,
        `- Tool schemas sent with every request: ~${schemaTokens.toLocaleString()} tokens (${registry.size} tools)`,
        "",
        "No request has been sent in this session yet, so there is nothing measured to report. Ask something and run this again.",
      ].join("\n"),
    };
  }

  const used = telemetry.lastPromptTokens;
  const remainder = Math.max(0, used - schemaTokens);
  const free = Math.max(0, window - used - reserve);
  const compactAt = Math.round(window * 0.8);

  return {
    kind: "local",
    output: [
      "### Context window",
      "",
      `- ${bar(used, reserve, window)}  ${percent(used, window)} used`,
      `- Last request carried ${used.toLocaleString()} of ${window.toLocaleString()} tokens; ${free.toLocaleString()} free before the ${reserve.toLocaleString()}-token reserve`,
      "",
      "| What | Tokens | How it is known |",
      "| :--- | ---: | :--- |",
      `| Tool schemas | ~${schemaTokens.toLocaleString()} | ${registry.size} tool definitions, serialised and counted |`,
      `| Instructions and conversation | ~${remainder.toLocaleString()} | the rest of what the provider counted |`,
      `| **Last request total** | **${used.toLocaleString()}** | reported by the provider |`,
      "",
      `Auto-compaction runs when a request would exceed about ${compactAt.toLocaleString()} tokens. \`/compact\` runs it now.`,
      telemetry.totalTokens > 0
        ? `\nAcross the whole session: ${telemetry.totalTokens.toLocaleString()} tokens over ${telemetry.turnsCount} ${telemetry.turnsCount === 1 ? "turn" : "turns"}.`
        : "",
    ].join("\n").replace(/\n+$/, ""),
  };
}

/** The window this process is configured for. */
function configuredWindow(): number {
  return Number.parseInt(process.env.AUTO_COMPACT_WINDOW ?? "", 10) || 64_000;
}

/** Tokens the tool definitions occupy, from the bytes actually sent. */
function toolSchemaTokens(): number {
  const serialised = JSON.stringify(buildOpenAITools(createCoreToolRegistry()));
  return Math.round(serialised.length / CHARS_PER_TOKEN);
}

/** A bar showing used, reserved, and free, in that order. */
function bar(used: number, reserve: number, window: number): string {
  const usedCells = Math.min(BAR_WIDTH, Math.round((used / window) * BAR_WIDTH));
  const reserveCells = Math.min(BAR_WIDTH - usedCells, Math.round((reserve / window) * BAR_WIDTH));
  const freeCells = Math.max(0, BAR_WIDTH - usedCells - reserveCells);
  return `\`${"█".repeat(usedCells)}${"▒".repeat(reserveCells)}${"░".repeat(freeCells)}\``;
}

function percent(part: number, whole: number): string {
  return `${((part / whole) * 100).toFixed(1)}%`;
}
