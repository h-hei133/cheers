import type { CommandContext, LocalCommandResult } from "./types.js";

export interface InstalledPlugin {
  readonly name: string;
  readonly version: string;
  enabled: boolean;
  readonly source: string;
  readonly description?: string;
  readonly capabilities?: readonly string[];
}

let installedPlugins: InstalledPlugin[] = [
  {
    name: "core-developer-suite",
    version: "1.0.0",
    enabled: true,
    source: "official",
    description: "Core coding capabilities: grep, lsp, code editing, and browser automation",
    capabilities: ["tools", "hooks", "commands"],
  },
  {
    name: "security-auditor",
    version: "0.2.1",
    enabled: true,
    source: "official",
    description: "Security analysis, privilege boundary auditing, and secret scanning",
    capabilities: ["hooks", "skills"],
  },
];

export function getInstalledPlugins(): readonly InstalledPlugin[] {
  return installedPlugins;
}

export function resetInstalledPlugins(): void {
  installedPlugins = [
    {
      name: "core-developer-suite",
      version: "1.0.0",
      enabled: true,
      source: "official",
      description: "Core coding capabilities: grep, lsp, code editing, and browser automation",
      capabilities: ["tools", "hooks", "commands"],
    },
    {
      name: "security-auditor",
      version: "0.2.1",
      enabled: true,
      source: "official",
      description: "Security analysis, privilege boundary auditing, and secret scanning",
      capabilities: ["hooks", "skills"],
    },
  ];
}

function normalizePluginName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * /plugin command
 * Manages plugin lifecycle: list, install, uninstall, enable, disable, search.
 */
export async function runPluginCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "list" || subCommand === "ls") {
    const lines: string[] = [
      "# Installed Plugins (/plugin)",
      "",
      "Active and installed plugin bundles:",
      "",
    ];

    installedPlugins.forEach((p, idx) => {
      const statusIcon = p.enabled ? "🟢 ENABLED" : "⚪ DISABLED";
      lines.push(`### ${idx + 1}. \`${p.name}\` (v${p.version}) [${statusIcon}]`);
      lines.push(`- **Source**: ${p.source}`);
      if (p.description) {
        lines.push(`- **Description**: ${p.description}`);
      }
      if (p.capabilities && p.capabilities.length > 0) {
        lines.push(`- **Capabilities**: ${p.capabilities.join(", ")}`);
      }
      lines.push("");
    });

    lines.push(
      "Commands:",
      "- `/plugin install <name>` : Install and register a new plugin",
      "- `/plugin uninstall <name>` : Remove an installed plugin",
      "- `/plugin enable <name>` : Enable an inactive plugin",
      "- `/plugin disable <name>` : Disable a plugin without uninstalling",
      "- `/plugin search <keyword>` : Search for available plugins",
    );

    return {
      kind: "local",
      output: lines.join("\n"),
    };
  }

  if (subCommand === "install" || subCommand === "add") {
    const target = args[1]?.trim();
    if (!target) {
      return {
        kind: "local",
        output: "Usage: `/plugin install <plugin_name_or_path>`\nExample: `/plugin install react-devtools`",
      };
    }

    const pluginName = normalizePluginName(target);
    const existing = installedPlugins.find((p) => p.name === pluginName);
    if (existing) {
      existing.enabled = true;
      return {
        kind: "local",
        output: `Plugin \`${pluginName}\` is already installed and has been marked ENABLED.`,
      };
    }

    installedPlugins.push({
      name: pluginName,
      version: "1.0.0",
      enabled: true,
      source: target.startsWith("http") ? "git-repository" : "marketplace",
      description: `Installed plugin package (${target})`,
      capabilities: ["tools", "skills"],
    });

    return {
      kind: "local",
      output: `Plugin \`${pluginName}\` (v1.0.0) successfully installed and activated.`,
    };
  }

  if (subCommand === "search" || subCommand === "find") {
    const query = args.slice(1).join(" ").trim().toLowerCase();
    if (!query) {
      return { kind: "local", output: "Usage: `/plugin search <keyword>`" };
    }

    const matches = installedPlugins.filter(
      (p) =>
        p.name.includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.capabilities?.some((c) => c.includes(query)),
    );

    if (matches.length === 0) {
      return {
        kind: "local",
        output: `No matching plugins found for keyword '${query}'.`,
      };
    }

    const lines = [`# Plugin Search Results for '${query}':`, ""];
    matches.forEach((p, idx) => {
      lines.push(`${idx + 1}. \`${p.name}\` (v${p.version}) - ${p.description ?? "No description"}`);
    });
    return { kind: "local", output: lines.join("\n") };
  }

  if (subCommand === "uninstall" || subCommand === "rm" || subCommand === "remove") {
    const target = args[1]?.trim();
    if (!target) {
      return { kind: "local", output: "Usage: `/plugin uninstall <name>`" };
    }

    const pluginName = normalizePluginName(target);
    const index = installedPlugins.findIndex((p) => p.name === pluginName);
    if (index === -1) {
      return {
        kind: "local",
        output: `Plugin '${target}' not found. Run \`/plugin list\` to view installed plugins.`,
      };
    }

    installedPlugins.splice(index, 1);
    return {
      kind: "local",
      output: `Plugin \`${pluginName}\` successfully uninstalled.`,
    };
  }

  if (subCommand === "enable") {
    const target = args[1]?.trim();
    const pluginName = target ? normalizePluginName(target) : "";
    const plugin = installedPlugins.find((p) => p.name === pluginName);
    if (!plugin) {
      return { kind: "local", output: `Plugin '${target}' not found.` };
    }
    plugin.enabled = true;
    return {
      kind: "local",
      output: `Plugin \`${pluginName}\` is now ENABLED.`,
    };
  }

  if (subCommand === "disable") {
    const target = args[1]?.trim();
    const pluginName = target ? normalizePluginName(target) : "";
    const plugin = installedPlugins.find((p) => p.name === pluginName);
    if (!plugin) {
      return { kind: "local", output: `Plugin '${target}' not found.` };
    }
    plugin.enabled = false;
    return {
      kind: "local",
      output: `Plugin \`${pluginName}\` is now DISABLED.`,
    };
  }

  return {
    kind: "local",
    output: [
      "Usage:",
      "- `/plugin` or `/plugin list` : Show all installed plugins",
      "- `/plugin install <name>` : Install a new plugin",
      "- `/plugin uninstall <name>` : Remove a plugin",
      "- `/plugin enable <name>` : Enable a plugin",
      "- `/plugin disable <name>` : Disable a plugin",
      "- `/plugin search <keyword>` : Search plugins",
    ].join("\n"),
  };
}
