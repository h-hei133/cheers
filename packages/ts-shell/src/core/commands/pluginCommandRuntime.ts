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

/**
 * /plugin command
 * Manages plugin lifecycle: list, install, uninstall, enable, disable.
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

    const pluginName = target.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "-");
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

  if (subCommand === "uninstall" || subCommand === "rm" || subCommand === "remove") {
    const target = args[1]?.trim().toLowerCase();
    if (!target) {
      return { kind: "local", output: "Usage: `/plugin uninstall <name>`" };
    }

    const index = installedPlugins.findIndex((p) => p.name === target);
    if (index === -1) {
      return {
        kind: "local",
        output: `Plugin '${target}' not found. Run \`/plugin list\` to view installed plugins.`,
      };
    }

    installedPlugins.splice(index, 1);
    return {
      kind: "local",
      output: `Plugin \`${target}\` successfully uninstalled.`,
    };
  }

  if (subCommand === "enable") {
    const target = args[1]?.trim().toLowerCase();
    const plugin = installedPlugins.find((p) => p.name === target);
    if (!plugin) {
      return { kind: "local", output: `Plugin '${target}' not found.` };
    }
    plugin.enabled = true;
    return {
      kind: "local",
      output: `Plugin \`${target}\` is now ENABLED.`,
    };
  }

  if (subCommand === "disable") {
    const target = args[1]?.trim().toLowerCase();
    const plugin = installedPlugins.find((p) => p.name === target);
    if (!plugin) {
      return { kind: "local", output: `Plugin '${target}' not found.` };
    }
    plugin.enabled = false;
    return {
      kind: "local",
      output: `Plugin \`${target}\` is now DISABLED.`,
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
    ].join("\n"),
  };
}
