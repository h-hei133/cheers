import type { CommandContext, LocalCommandResult } from "./types.js";
import { createCoreToolRegistry } from "../tools/registry.js";

/**
 * /tools — what the model can actually do this turn.
 *
 * Read straight from the registry that builds the request, so the list cannot
 * drift from what is offered: a hand-maintained list of tool names is wrong the
 * first time a tool is added and nobody notices until the model calls something
 * the list denies exists.
 *
 * Plan mode is shown per tool rather than described in prose, because "read-only
 * tools are allowed" is not checkable and this is.
 */

/**
 * Tools plan mode permits.
 *
 * This mirrors the gate in the agent loop. It is duplicated deliberately rather
 * than exported from there: the loop's copy is the one that decides, and a display
 * that imported it would be able to drift only by being wrong about a name, which
 * the test catches.
 */
const ALLOWED_IN_PLAN = new Set([
  "read",
  "glob",
  "grep",
  "lsp",
  "browser",
  "web_fetch",
  "web_search",
  "ask",
  "todo",
  "task",
]);

export async function runToolsCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const registry = createCoreToolRegistry();
  const wanted = args[0]?.toLowerCase();

  if (wanted) {
    const tool = registry.get(wanted);
    if (!tool) {
      return {
        kind: "local",
        output: `No tool named \`${wanted}\`. \`/tools\` lists the ${registry.size} there are.`,
      };
    }
    return { kind: "local", output: detail(tool.name, tool.description, tool.argsSchema) };
  }

  const rows = [...registry.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => `| \`${tool.name}\` | ${plan(tool.name)} | ${firstSentence(tool.description)} |`);

  return {
    kind: "local",
    output: [
      `### Tools (${registry.size})`,
      "",
      "| Tool | Plan mode | What it does |",
      "| :--- | :--- | :--- |",
      ...rows,
      "",
      "`/tools <name>` shows one tool's arguments. Plan mode blocks anything that can change the workspace; `bash` is allowed there only for commands that read.",
    ].join("\n"),
  };
}

/** Whether plan mode lets this tool run, in the words the band uses. */
function plan(name: string): string {
  if (ALLOWED_IN_PLAN.has(name)) return "allowed";
  return name === "bash" ? "read-only" : "blocked";
}

/** One tool in full: what it does and what it takes. */
function detail(name: string, description: string, schema: Record<string, unknown>): string {
  const properties = schema.properties;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const lines = [`### \`${name}\``, "", description.trim(), "", `- Plan mode: ${plan(name)}`, ""];

  if (!properties || typeof properties !== "object") {
    lines.push("It takes no arguments.");
    return lines.join("\n");
  }
  lines.push("| Argument | Type | Required |", "| :--- | :--- | :--- |");
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    const shape = value && typeof value === "object" ? (value as { type?: unknown }) : {};
    const type = typeof shape.type === "string" ? shape.type : "any";
    lines.push(`| \`${key}\` | ${type} | ${required.has(key) ? "yes" : "no"} |`);
  }
  return lines.join("\n");
}

/**
 * The first sentence of a description, so the table stays one row per tool.
 *
 * An abbreviation is not a sentence end. Cutting at the first ". " turned
 * "matching a path pattern (e.g. *.ts)" into "matching a path pattern (e.g." —
 * technically the first period, and useless as a description.
 */
function firstSentence(description: string): string {
  const flat = description.replace(/\s+/g, " ").trim();
  let from = 0;
  for (;;) {
    const stop = flat.indexOf(". ", from);
    if (stop < 0) break;
    if (!ABBREVIATION.test(flat.slice(0, stop + 1))) return trim(flat.slice(0, stop + 1));
    from = stop + 2;
  }
  return trim(flat);
}

/** Abbreviations whose period is not the end of a sentence. */
const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|cf|no)\.$/i;

/** Short enough for one table row. */
function trim(text: string): string {
  return text.length > 110 ? `${text.slice(0, 109)}…` : text;
}
