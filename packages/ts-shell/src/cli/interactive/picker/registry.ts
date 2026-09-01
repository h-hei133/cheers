import type { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { StatusItemId } from "../../../presentation/tui/chrome/items.js";
import type { Picker } from "../overlay.js";
import { modelPicker } from "./model.js";
import { permissionPicker } from "./permissions.js";
import { pluginPicker } from "./plugins.js";
import { serverPicker } from "./servers.js";
import { sessionPicker } from "./session.js";
import { statusItemPicker } from "./statusItems.js";

/**
 * Which commands open a chooser.
 *
 * A command listed here stops printing a catalogue the user has to read and
 * retype, and opens the corresponding picker instead. Everything the picker needs
 * from the host arrives through {@link PickerHost}, so the pickers themselves stay
 * free of session plumbing.
 */

export interface PickerHost {
  readonly commandContext: CommandContext;
  readonly sessionManager: SessionManager;
  readonly mcpGateway: CliMcpGateway;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly projectRoot: string;
  readonly statusItems: readonly StatusItemId[];
  resumeSession(sessionId: string): Promise<string | undefined>;
  refreshServer(serverName: string): Promise<string | undefined>;
  revokeGrant(key: string): Promise<string | undefined>;
  saveStatusItems(items: readonly StatusItemId[]): Promise<string | undefined>;
}

type PickerFactory = (host: PickerHost) => Picker;

const PICKERS: Record<string, PickerFactory> = {
  model: (host) => modelPicker(host.commandContext),
  resume: (host) => sessionPicker({ sessionManager: host.sessionManager, resume: host.resumeSession }),
  mcp: (host) => serverPicker({ gateway: host.mcpGateway, refresh: host.refreshServer }),
  connect: (host) => serverPicker({ gateway: host.mcpGateway, refresh: host.refreshServer }),
  permissions: (host) =>
    permissionPicker({
      policy: host.approvalTrustPolicy,
      projectRoot: host.projectRoot,
      revoke: host.revokeGrant,
    }),
  plugin: (host) => pluginPicker(host.commandContext),
  statusline: (host) =>
    statusItemPicker({ current: host.statusItems, save: host.saveStatusItems }),
};

/** The picker a bare command opens, or undefined when it has none. */
export function pickerFor(command: string, host: PickerHost): Picker | undefined {
  return PICKERS[command.replace(/^\//, "").toLowerCase()]?.(host);
}

/** Whether a submitted line is a bare command that opens a picker. */
export function opensPicker(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return false;
  // Arguments mean the user already knows what they want; only the bare form
  // opens a chooser, so `/model use x` still works as typed.
  return !/\s/.test(trimmed) && trimmed.slice(1).toLowerCase() in PICKERS;
}
