import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { McpConnectionState } from "../../../core/mcp/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Server chooser.
 *
 * Each server carries its connection state, its tool count, and — when it failed
 * — why. That is more than a row, so this takes the whole screen; choosing a
 * server refreshes it, which is the action a user wants when one is unhealthy.
 */

export interface ServerPickerOptions {
  readonly gateway: CliMcpGateway;
  /** Refresh one server and report the outcome. */
  readonly refresh: (serverName: string) => Promise<string | undefined>;
}

export function serverPicker(options: ServerPickerOptions & { readonly add?: () => Picker }): Picker {
  return {
    title: "Servers",
    form: "panel",
    empty: "No servers configured.",
    async load(): Promise<readonly Option[]> {
      const snapshot = await options.gateway.snapshot();
      const toolCounts = countTools(snapshot.tools);
      return [
        ...snapshot.clients.map<Option>((client) => ({
          id: client.name,
          label: client.name,
          detail: detailFor(client, toolCounts.get(client.name) ?? 0),
          note: client.type,
        })),
        ...(options.add ? [{ id: '__add__', label: 'Add server…', detail: 'Define a new server step by step' }] : []),
      ];
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const name = ids[0];
      if (!name) return undefined;
      if (name === '__add__') return options.add ? { next: options.add() } : undefined;
      const note = await options.refresh(name);
      return note ? { note } : undefined;
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

function detailFor(client: McpConnectionState, tools: number): string {
  if (client.type === "failed") return client.error;
  if (client.type === "needs-auth") return "authentication required";
  if (client.type === "disabled") return "disabled in configuration";
  return `${tools} tool${tools === 1 ? "" : "s"}`;
}
