import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { pluginSyntax } from "./plugin/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import { getInstalledPlugins, getPluginStoragePath, savePersistedPlugins, withPluginRegistry, type InstalledPlugin } from "./plugin/store.js";
export { getInstalledPlugins, resetInstalledPlugins, type InstalledPlugin, type PluginOrigin } from "./plugin/store.js";

/**
 * Extension registry.
 *
 * An extension is a package name or a directory on disk, the way every reference
 * implementation resolves one — there is no catalogue service behind this and
 * nothing is exchanged with a third party. Registering one records an address and
 * a manifest; this build does not execute extensions, and the output says so
 * rather than implying a capability arrived.
 */

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
    if (!manifest || (manifest.name !== undefined && (typeof manifest.name !== "string" || !manifest.name.trim())) ||
      (manifest.version !== undefined && typeof manifest.version !== "string") ||
      (manifest.description !== undefined && typeof manifest.description !== "string")) return { error: "Extension manifest fields must be strings." };
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

function normalizePluginName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * /plugin command
 *
 * Manages the registry of extension registrations with permanent disk
 * persistence: list, add, remove, enable, disable, search. Nothing here loads
 * code — a registration is a record kept for a loader that does not exist yet,
 * and the messages say so rather than implying the registration took effect.
 */
export async function runPluginCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  if (context.extensionCommand) return context.extensionCommand('plugin', args, context);
  const parsed = parseSyntax(pluginSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /plugin arguments: ${parsed.reason}\n${syntaxHelp(pluginSyntax)}` };
  if (parsed.action.name === 'install') return { kind: 'local', output: 'Signed extension installation requires a bound session runtime and an explicit source:name@exact-version. A legacy registration is added with /plugin add and grants no runtime authority.' };
  try {
    const run = (plugins: InstalledPlugin[]) => runPluginAction([parsed.action.name, ...parsed.args], context, plugins);
    return ["add", "remove", "enable", "disable"].includes(parsed.action.name) ? withPluginRegistry(run) : run(getInstalledPlugins());
  } catch {
    return { kind: "local", output: "Extension registry operation failed. The requested change was not confirmed saved." };
  }
}

function runPluginAction(args: readonly string[], context: CommandContext, cachedPlugins: InstalledPlugin[]): LocalCommandResult {
  const subCommand = args[0];

  if (!subCommand || subCommand === "list" || subCommand === "ls") {
    if (cachedPlugins.length === 0) {
      return {
        kind: "local",
        output: [
          "### Extensions",
          "",
          "None registered.",
          "",
          "Record one by package name or by path:",
          "",
          "- `/plugin add ./tools/my-extension` — read now from its `package.json`",
          "- `/plugin add some-package` — recorded unresolved until it is installed",
          "",
          "A registration is a record only. This build loads no code from one;",
          "the record is kept so a future loader can pick it up unchanged.",
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
      "A registration is a record only. This build loads no code from one;",
      "the record is kept so a future loader can pick it up unchanged.",
    );
    return { kind: "local", output: lines.join("\n") };
  }

  if (subCommand === "add") {
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

  if (subCommand === "search") {
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

  if (subCommand === "remove") {
    const pluginName = args[1];
    if (!pluginName) {
      return {
        kind: "local",
        output: "Usage: `/plugin remove <plugin-name>`",
      };
    }

    const normalized = normalizePluginName(pluginName);
    const index = cachedPlugins.findIndex((p) => p.name === normalized);
    if (index === -1) {
      return {
        kind: "local",
        output: `Plugin \`${normalized}\` is not registered.`,
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
      "- `/plugin enable <name>` / `/plugin disable <name>` — set the record's enabled flag",
      "",
      "A registration is a record only. This build loads no code from one;",
      "the record is kept so a future loader can pick it up unchanged.",
    ].join("\n"),
  };
}
