import type { CommandContext, LocalCommandResult } from "./types.js";

export interface MarketplaceSource {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

let marketplaceSources: MarketplaceSource[] = [];

export function getMarketplaceSources(): readonly MarketplaceSource[] {
  return marketplaceSources;
}

export function resetMarketplaceSources(): void {
  marketplaceSources = [];
}

/**
 * /marketplace command
 * Manages plugin marketplace sources for discovering, adding, and removing plugin catalogs.
 */
export async function runMarketplaceCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "list" || subCommand === "ls") {
    const lines: string[] = [
      "# Plugin Marketplaces (/marketplace)",
      "",
      marketplaceSources.length === 0
        ? "No marketplace sources configured."
        : "Registered marketplace sources for plugin discovery:",
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
      "- `/plugin search <keyword>` : Search for plugins across all marketplaces",
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

    if (marketplaceSources.some((m) => m.name === name)) {
      return {
        kind: "local",
        output: `Marketplace with name '${name}' already exists. Use a distinct name or remove it first.`,
      };
    }

    marketplaceSources.push({
      name,
      url,
      description: `Custom marketplace source (${url})`,
    });

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

    const index = marketplaceSources.findIndex((m) => m.name === name);
    if (index === -1) {
      return {
        kind: "local",
        output: `Marketplace source '${name}' not found. Run \`/marketplace list\` to view available sources.`,
      };
    }

    marketplaceSources.splice(index, 1);
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
