import { entitySyntax } from "./syntax/entity.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { createCoreToolRegistry } from "../tools/registry.js";
import { toolPlanMode } from "../query/toolPolicy.js";
import type { ToolDefinition } from "../../tools/types.js";

export const toolsSyntax = entitySyntax("tools");

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

export async function runToolsCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseSyntax(toolsSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /tools arguments: ${parsed.reason}\n${syntaxHelp(toolsSyntax)}` };
  const registry = context.getToolPool ? await context.getToolPool() : createCoreToolRegistry();
  const wanted = parsed.args[0];

  if (wanted) {
    const tool = registry.get(wanted) ?? registry.get(wanted.toLowerCase());
    if (!tool) {
      return {
        kind: "local",
        output: `No tool named \`${wanted}\`. \`/tools\` lists the ${registry.size} there are.`,
      };
    }
    return { kind: "local", output: detail(tool) };
  }

  const rows = [...registry.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((tool) => `| \`${tool.name}\` | ${toolPlanMode(tool.name, tool)} | ${firstSentence(tool.description)} |`);

  return {
    kind: "local",
    output: [
      `### Tools (${registry.size})`,
      "",
      "| Tool | Plan mode | What it does |",
      "| :--- | :--- | :--- |",
      ...rows,
      "",
      "`/tools <name>` shows one tool's arguments. Plan mode permits only read-only `bash` commands and `browser` actions. Eligible tools still require the session's permissions and approval.",
    ].join("\n"),
  };
}

/** One tool in full: what it does and what it takes. */
function detail(tool: ToolDefinition): string {
  const { name, description, argsSchema: schema } = tool;
  const properties = schema.properties;
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const lines = [`### \`${name}\``, "", description.trim(), "", `- Plan mode: ${toolPlanMode(name, tool)}`, ""];

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
