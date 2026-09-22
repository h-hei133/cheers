import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { resolveUserDataFile, userDataDir } from "../../core/paths/userHome.js"

/**
 * Extension registry.
 *
 * An extension is a package name or a directory on disk, the way every reference
 * implementation resolves one — there is no catalogue service behind this and
 * nothing is exchanged with a third party. Registering one records an address and
 * a manifest; this build does not execute extensions, and the output says so
 * rather than implying a capability arrived.
 */

export type PluginOrigin = "path" | "package";

export interface InstalledPlugin {
  readonly name: string;
  readonly version: string;
  enabled: boolean;
  /** Where the extension resolves from: a local directory, or a package name. */
  readonly source: PluginOrigin;
  /** The path or package spec exactly as given. */
  readonly spec: string;
  readonly description?: string;
  /** False until the spec has been resolved on disk. */
  readonly resolved: boolean;
}

function getPluginStoragePath(): string {
  const customPath = process.env.CHEERS_PLUGINS_FILE?.trim();
  if (customPath) return customPath;
  return resolveUserDataFile("plugins.json");
}

/** Nothing is registered until the user registers it. */
function getDefaultPlugins(): InstalledPlugin[] {
  return [];
}

/**
 * Resolve a spec to a manifest without fetching anything.
 *
 * A local directory can be read now, so it is: its own `package.json` names it,
 * and a spec pointing at nothing is refused rather than recorded. A package name
 * cannot be checked without the network, so it is recorded unresolved and
 * reported as such.
 */
function describeSpec(spec: string, cwd: string): InstalledPlugin | { readonly error: string } {
  const local = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~");
  if (!local) {
    return {
      name: normalizePluginName(spec),
      version: "unresolved",
      enabled: true,
      source: "package",
      spec,
      resolved: false,
    };
  }
  const expanded = spec.startsWith("~") ? path.join(os.homedir(), spec.slice(1)) : spec;
  const root = path.resolve(cwd, expanded);
  const manifestPath = path.join(root, "package.json");
  if (!fs.existsSync(manifestPath)) {
    return { error: `No \`package.json\` under \`${root}\`, so there is nothing to register.` };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      name?: string;
      version?: string;
      description?: string;
    };
    return {
      name: normalizePluginName(manifest.name ?? path.basename(root)),
      version: manifest.version ?? "0.0.0",
      enabled: true,
      source: "path",
      spec: root,
      description: manifest.description,
      resolved: true,
    };
  } catch {
    return { error: `\`${manifestPath}\` is not readable JSON, so there is nothing to register.` };
  }
}

function loadPersistedPlugins(): InstalledPlugin[] {
  const filePath = getPluginStoragePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data) as InstalledPlugin[];
    }
  } catch {
    // Fallback
  }

  return getDefaultPlugins();
}

function savePersistedPlugins(plugins: InstalledPlugin[]): void {
  const filePath = getPluginStoragePath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(plugins, null, 2), "utf8");
  } catch {
    // Non-blocking
  }
}

let cachedPlugins: InstalledPlugin[] = loadPersistedPlugins();

export function getInstalledPlugins(): readonly InstalledPlugin[] {
  return cachedPlugins;
}

export function resetInstalledPlugins(): void {
  cachedPlugins = getDefaultPlugins();
  savePersistedPlugins(cachedPlugins);
}

function normalizePluginName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * /plugin command
 * Manages plugin lifecycle with permanent disk persistence: list, install, uninstall, enable, disable, search.
 */
export async function runPluginCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const subCommand = args[0]?.toLowerCase();

  if (!subCommand || subCommand === "list" || subCommand === "ls") {
    if (cachedPlugins.length === 0) {
      return {
        kind: "local",
        output: [
          "### Extensions",
          "",
          "None registered.",
          "",
          "Register one by package name or by path:",
          "",
          "- `/plugin add ./tools/my-extension` — read now from its `package.json`",
          "- `/plugin add some-package` — recorded unresolved until it is installed",
          "",
          "Nothing is executed from a registration in this build.",
        ].join("\n"),
      };
    }
    const lines = [
      "### Extensions",
      "",
      "| Name | Version | State | From |",
      "| :--- | :--- | :--- | :--- |",
    ];
    for (const plugin of cachedPlugins) {
      const state = !plugin.resolved ? "unresolved" : plugin.enabled ? "enabled" : "disabled";
      lines.push(`| ${plugin.name} | ${plugin.version} | ${state} | \`${plugin.spec}\` |`);
    }
    lines.push(
      "",
      `Registry: \`${getPluginStoragePath()}\``,
      "",
      "Nothing is executed from a registration in this build.",
    );
    return { kind: "local", output: lines.join("\n") };
  }

  if (subCommand === "install" || subCommand === "add") {
    const spec = args[1]?.trim();
    if (!spec) {
      return {
        kind: "local",
        output: [
          "Usage: `/plugin add <path-or-package>`",
          "",
          "- `/plugin add ./tools/my-extension`",
          "- `/plugin add some-package`",
        ].join("\n"),
      };
    }

    const described = describeSpec(spec, context.cwd ?? process.cwd());
    if ("error" in described) return { kind: "local", output: described.error };

    const existing = cachedPlugins.find((plugin) => plugin.name === described.name);
    if (existing) {
      return {
        kind: "local",
        output: `\`${described.name}\` is already registered from \`${existing.spec}\`. Remove it first to point it somewhere else.`,
      };
    }

    cachedPlugins.push(described);
    savePersistedPlugins(cachedPlugins);

    return {
      kind: "local",
      output: [
        `### Registered \`${described.name}\``,
        "",
        `- Version: ${described.version}`,
        `- From: \`${described.spec}\``,
        `- Resolved: ${described.resolved ? "yes, read from its manifest" : "no — the package has not been fetched"}`,
        `- Recorded in: \`${getPluginStoragePath()}\``,
        "",
        described.resolved
          ? "The registration is recorded. This build does not execute extensions, so nothing about the running session changed."
          : "Nothing was downloaded. Install the package with your package manager, then re-register it from its path to have its manifest read.",
      ].join("\n"),
    };
  }

  if (subCommand === "search" || subCommand === "find") {
    return {
      kind: "local",
      output: [
        "### Search",
        "",
        "There is no catalogue service behind this: extensions resolve as packages or as paths, and a source is just an address to look at yourself.",
        "",
        "- `/marketplace` lists the registered sources",
        "- `/plugin add <path-or-package>` registers one by name or location",
      ].join("\n"),
    };
  }

  if (subCommand === "uninstall" || subCommand === "rm" || subCommand === "remove") {
    const pluginName = args[1];
    if (!pluginName) {
      return {
        kind: "local",
        output: "Usage: `/plugin uninstall <plugin-name>`",
      };
    }

    const normalized = normalizePluginName(pluginName);
    const index = cachedPlugins.findIndex((p) => p.name === normalized);
    if (index === -1) {
      return {
        kind: "local",
        output: `Plugin \`${normalized}\` is not installed.`,
      };
    }

    cachedPlugins.splice(index, 1);
    savePersistedPlugins(cachedPlugins);

    return {
      kind: "local",
      output: `Removed \`${normalized}\` from the registry.`,
    };
  }

  if (subCommand === "enable") {
    const pluginName = args[1];
    const normalized = normalizePluginName(pluginName || "");
    const plugin = cachedPlugins.find((p) => p.name === normalized);
    if (!plugin) {
      return {
        kind: "local",
        output: `Plugin \`${normalized}\` not found.`,
      };
    }
    plugin.enabled = true;
    savePersistedPlugins(cachedPlugins);
    return {
      kind: "local",
      output: `\`${normalized}\` is marked enabled in the registry.`,
    };
  }

  if (subCommand === "disable") {
    const pluginName = args[1];
    const normalized = normalizePluginName(pluginName || "");
    const plugin = cachedPlugins.find((p) => p.name === normalized);
    if (!plugin) {
      return {
        kind: "local",
        output: `Plugin \`${normalized}\` not found.`,
      };
    }
    plugin.enabled = false;
    savePersistedPlugins(cachedPlugins);
    return {
      kind: "local",
      output: `\`${normalized}\` is marked disabled in the registry.`,
    };
  }

  return {
    kind: "local",
    output: [
      "### /plugin",
      "",
      "- `/plugin` — list registered extensions",
      "- `/plugin add <path-or-package>` — register one by location or name",
      "- `/plugin remove <name>` — drop a registration",
      "- `/plugin enable <name>` / `/plugin disable <name>` — mark one for loading",
      "",
      "Nothing is executed from a registration in this build.",
    ].join("\n"),
  };
}
