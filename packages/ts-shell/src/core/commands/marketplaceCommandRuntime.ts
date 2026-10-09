import { marketplaceSyntax } from "./marketplace/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

import { addMarketplaceSource, getMarketplaceSources, removeMarketplaceSource } from "./marketplace/store.js";
export { getMarketplaceSources, resetMarketplaceSources, type MarketplaceSource } from "./marketplace/store.js";

/**
 * /marketplace command
 * Records source addresses. This build does not fetch or search catalogues.
 */
export async function runMarketplaceCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  if (_context.extensionCommand) return _context.extensionCommand('marketplace', args, _context);
  const parsed = parseSyntax(marketplaceSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /marketplace arguments: ${parsed.reason}\n${syntaxHelp(marketplaceSyntax)}` };
  try {
    return runMarketplaceAction([parsed.action.name, ...parsed.args]);
  } catch (error) {
    return { kind: "local", output: `Marketplace source operation failed: ${error instanceof Error ? error.message : "storage unavailable"}` };
  }
}

function runMarketplaceAction(args: string[]): LocalCommandResult {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "list" || subCommand === "ls") {
    const marketplaceSources = getMarketplaceSources();
    const lines: string[] = [
      "# Plugin Marketplaces (/marketplace)",
      "",
      marketplaceSources.length === 0
        ? "No marketplace sources configured."
        : "Registered marketplace source addresses:",
      "",
    ];

    marketplaceSources.forEach((m, idx) => {
      const tag = m.isDefault ? " *(default)*" : "";
      lines.push(`### ${idx + 1}. \`${m.name}\`${tag}`);
      lines.push(`- **URL**: ${m.url}`);
      if (m.description) {
        lines.push(`- **Description**: ${m.description}`);
      }
      lines.push("");
    });

    lines.push(
      "Commands:",
      "- `/marketplace add <name> <url>` : Register a new plugin marketplace",
      "- `/marketplace remove <name>` : Unregister a marketplace source",
      "",
      "Sources are saved addresses to visit yourself. This build does not fetch or search catalogues.",
    );

    return {
      kind: "local",
      output: lines.join("\n"),
    };
  }

  if (subCommand === "add") {
    const name = args[1]?.trim().toLowerCase();
    const url = args[2]?.trim();
    if (!name || !url) {
      return {
        kind: "local",
        output: "Usage: `/marketplace add <name> <url>`\nExample: `/marketplace add internal https://github.com/my-org/agent-plugins`",
      };
    }

    if (!addMarketplaceSource({ name, url, description: `Custom marketplace source (${url})` })) {
      return {
        kind: "local",
        output: `Marketplace with name '${name}' already exists. Use a distinct name or remove it first.`,
      };
    }

    return {
      kind: "local",
      output: `Marketplace source \`${name}\` successfully registered (${url}).`,
    };
  }

  if (subCommand === "remove" || subCommand === "rm" || subCommand === "delete") {
    const name = args[1]?.trim().toLowerCase();
    if (!name) {
      return {
        kind: "local",
        output: "Usage: `/marketplace remove <name>`",
      };
    }

    if (!removeMarketplaceSource(name)) {
      return {
        kind: "local",
        output: `Marketplace source '${name}' not found. Run \`/marketplace list\` to view available sources.`,
      };
    }

    return {
      kind: "local",
      output: `Marketplace source \`${name}\` removed.`,
    };
  }

  return {
    kind: "local",
    output: [
      "Usage:",
      "- `/marketplace` or `/marketplace list` : List registered marketplace sources",
      "- `/marketplace add <name> <url>` : Add a new plugin marketplace",
      "- `/marketplace remove <name>` : Remove a marketplace source",
    ].join("\n"),
  };
}
