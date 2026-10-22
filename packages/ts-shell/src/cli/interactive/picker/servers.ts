import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { McpConnectionState, McpClientSnapshot, ScopedMcpServerConfig } from "../../../core/mcp/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { mcpReport } from "../../../core/commands/mcp/report.js";
import { reportMetadata } from "../../../core/commands/report/metadata.js";

/**
 * Server chooser.
 *
 * Each server carries its connection state, its tool count, and — when it failed
 * — why. That is more than a row, so this takes the whole screen; choosing a
 * server refreshes it, which is the action a user wants when one is unhealthy.
 */

export interface ServerPickerOptions {
  readonly gateway: CliMcpGateway;
  readonly root: string;
  readonly admission?: () => string | undefined;
  /** Refresh one exact server through the existing gateway owner. */
  readonly refresh: (serverName: string, expected: ScopedMcpServerConfig, admission?: () => string | undefined) => Promise<McpClientSnapshot>;
}

export function serverPicker(options: ServerPickerOptions & { readonly add?: () => Picker }): Picker {
  const offered = new Map<string, ScopedMcpServerConfig>(); let loaded = false; let used = false;
  const current = () => { try { return options.admission?.() === undefined; } catch { return false; } };
  return {
    isCurrent: current,
    exclusive: true,
    title: "Servers",
    form: "panel",
    empty: "No servers configured.",
    async load(signal): Promise<readonly Option[]> {
      signal?.throwIfAborted(); offered.clear(); loaded = false; used = false; if (!current()) return [];
      const snapshot = await options.gateway.snapshot(options.admission, signal);
      signal?.throwIfAborted(); if (!current()) { offered.clear(); return []; }
      offered.clear(); loaded = true; used = false;
      const toolCounts = countTools(snapshot.tools);
      return [
        ...snapshot.clients.map<Option>((client) => {
          offered.set(client.name, client.config);
          return {
            id: client.name,
            label: reportMetadata(client.name, options.root),
            detail: detailFor(client, toolCounts.get(client.name) ?? 0, options.root),
            note: client.type,
          };
        }),
        ...(options.add ? [{ id: '__add__', label: 'Add server…', detail: 'Define a new server step by step' }] : []),
      ];
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      if (!loaded || used || ids.length !== 1 || !current()) return undefined;
      const name = ids[0];
      if (!name) return undefined;
      if (name === '__add__') { used = true; return options.add ? { next: options.add() } : undefined; }
      const expected = offered.get(name); if (!expected) return undefined;
      used = true;
      let snapshot: McpClientSnapshot;
      try { snapshot = await options.refresh(name, expected, options.admission); }
      catch (error) { throw new Error(reportMetadata(error instanceof Error ? error.message : String(error), options.root)); }
      if (!current()) return undefined;
      return { report: mcpReport(snapshot, options.root) };
    },
  };
}

/** Tools per server, so an apparently healthy server exposing none is visible. */
function countTools(tools: readonly { readonly serverName?: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tool of tools) {
    if (!tool.serverName) continue;
    counts.set(tool.serverName, (counts.get(tool.serverName) ?? 0) + 1);
  }
  return counts;
}

function detailFor(client: McpConnectionState, tools: number, root: string): string {
  if (client.type === "failed") return reportMetadata(client.error, root);
  if (client.type === "needs-auth") return "authentication required";
  if (client.type === "disabled") return "disabled in configuration";
  if (client.type === 'pending') return 'connecting…';
  return `${tools} tool${tools === 1 ? "" : "s"}`;
}
