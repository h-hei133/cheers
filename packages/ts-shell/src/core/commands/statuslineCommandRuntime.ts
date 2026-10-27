import { statuslineSyntax, parseStatuslineArgs } from "./statusline/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";
import {
  DEFAULT_STATUS_ITEMS,
  STATUS_ITEMS,
  type StatusItemId,
} from "../../presentation/tui/chrome/items.js";
import { readStatusItems, writeStatusItems } from "../../cli/interactive/tuiSettings.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * The band's items, as a command rather than only as a panel.
 *
 * The bare form opens the picker on an interactive surface, which is the
 * gesture most people use. This is the form that works everywhere else — a
 * scripted run, a piped prompt, a terminal the picker cannot take over — and it
 * is what makes the value reachable at all when there is no overlay to open.
 */

/** Every id the band can show, in picker order. */
const VALID_IDS: readonly StatusItemId[] = STATUS_ITEMS.map((item) => item.id);

export async function runStatuslineCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const parsed = parseStatuslineArgs(args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /statusline arguments: ${parsed.reason}\n${syntaxHelp(statuslineSyntax)}` };
  if (parsed.action.name === "list") {
    return { kind: "local", output: renderItemCatalogue(readStatusItems(statusRoot(context))) };
  }
  const requested = parsed.args;

  // Order follows the catalogue rather than the typing, so the band reads the
  // same way whoever wrote it, and duplicates cannot occupy two slots.
  const wanted = new Set(requested);
  const items = VALID_IDS.filter((id) => wanted.has(id));
  const written = writeStatusItems(statusRoot(context), items);
  let application: 'applied' | 'unavailable' | 'unverified' = context.applyDisplayConfig ? 'unverified' : 'unavailable';
  if (context.applyDisplayConfig) {
    try {
      context.applyDisplayConfig({ tui: { ...context.runtimeConfig?.tui, statusItems: items } });
      application = 'applied';
    } catch { /* The durable write remains known; live application does not. */ }
  }

  const where =
    written.scope === "project"
      ? `this project's file (${written.path}), which outranks your own`
      : `your config file (${written.path})`;
  return {
    kind: "local",
    output: [
      `Status band set to: ${items.join(", ")}.`,
      `Saved to ${where}.`,
      application === 'applied'
        ? "Applied to this session; a fresh shell reads it from the start."
        : application === 'unverified'
        ? "The file was saved, but applying it to this session is unconfirmed."
        : "This command context has no live status band; a fresh shell reads it from the start.",
    ].join("\n"),
  };
}

/** Where the band's preference lives: the project root, or `cwd` when unknown. */
function statusRoot(context: CommandContext): string {
  return context.projectRoot ?? context.cwd;
}

/** The catalogue, with the current choice marked. */
function renderItemCatalogue(current: readonly StatusItemId[]): string {
  const lines = ["### Status band", ""];
  for (const item of STATUS_ITEMS) {
    const mark = current.includes(item.id) ? " **(in use)**" : "";
    lines.push(`- \`${item.id}\` — ${item.describe}${mark}`);
  }
  lines.push(
    "",
    current.length > 0
      ? `Currently: ${current.join(", ")}.`
      : `Currently: the default set (${DEFAULT_STATUS_ITEMS.join(", ")}).`,
    "Set them with `/statusline use <item...>`, or run `/statusline` alone to choose from a panel.",
  );
  return lines.join("\n");
}
