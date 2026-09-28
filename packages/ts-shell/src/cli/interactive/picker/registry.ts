import type { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { StatusItemId } from "../../../presentation/tui/chrome/items.js";
import type { SessionMessage } from "../../../session/schema/sessionMessage.js";
import type { RewindPoint } from "./rewind.js";
import type { Transcript } from "../../../presentation/tui/transcript/container.js";
import type { Picker } from "../overlay.js";
import { connectionPicker } from "./connections.js";
import { copyPicker } from "./copy.js";
import { modelPicker } from "./model.js";
import { permissionPicker } from "./permissions.js";
import { pluginPicker } from "./plugins.js";
import { restorePicker } from "./restore.js";
import { rewindPicker } from "./rewind.js";
import { serverPicker } from "./servers.js";
import { skillPicker } from "./skills.js";
import { sourcePicker } from "./sources.js";
import { sessionPicker } from "./session.js";
import { statusItemPicker } from "./statusItems.js";
import { settingsPicker } from "./settings.js";

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
  readonly transcript: Transcript;
  readonly sessionManager: SessionManager;
  readonly mcpGateway: CliMcpGateway;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly projectRoot: string;
  readonly statusItems: readonly StatusItemId[];
  resumeSession(sessionId: string): Promise<string | undefined>;
  deleteSession(sessionId: string): Promise<string | undefined>;
  renameSession(sessionId: string, title: string): Promise<string | undefined>;
  refreshServer(serverName: string): Promise<string | undefined>;
  revokeGrant(key: string): Promise<string | undefined>;
  saveStatusItems(items: readonly StatusItemId[]): Promise<string | undefined>;
  /** Show `items` in the band without saving; `undefined` restores the saved band. */
  previewStatusItems(items: readonly StatusItemId[] | undefined): void;
  /** The current session's stored turns, for choosing a point to go back to. */
  sessionTurns(): readonly SessionMessage[];
  /** Drop everything after a chosen point, leaving the workspace alone. */
  rewind(point: RewindPoint): Promise<string | undefined>;
  /** The stored value of a settings toggle, or its default. */
  readSetting(key: "attentionOnIdle" | "offline"): boolean;
  /** Persist a settings toggle; the host owns where that lives. */
  saveSetting(key: "attentionOnIdle" | "offline", value: boolean): Promise<void>;
}

type PickerFactory = (host: PickerHost) => Picker;

const PICKERS: Record<string, PickerFactory> = {
  model: (host) => modelPicker(host.commandContext),
  copy: (host) => copyPicker(host.transcript, host.commandContext),
  resume: (host) =>
    sessionPicker({
      sessionManager: host.sessionManager,
      resume: host.resumeSession,
      delete: host.deleteSession,
      rename: host.renameSession,
    }),
  mcp: (host) => serverPicker({ gateway: host.mcpGateway, refresh: host.refreshServer }),
  connect: (host) => connectionPicker(host.commandContext),
  permissions: (host) =>
    permissionPicker({
      policy: host.approvalTrustPolicy,
      projectRoot: host.projectRoot,
      revoke: host.revokeGrant,
    }),
  plugin: (host) => pluginPicker(host.commandContext),
  marketplace: (host) => sourcePicker(host.commandContext),
  restore: (host) => restorePicker(host.projectRoot),
  skill: (host) => skillPicker(host.commandContext),
  // Reachable either way: `/back`, or Escape twice on an empty prompt. The
  // gesture is fast once known; the command is how it becomes known.
  back: (host) => rewindPicker({ turns: host.sessionTurns(), rewind: host.rewind }),
  statusline: (host) =>
    statusItemPicker({
      current: host.statusItems,
      save: host.saveStatusItems,
      preview: host.previewStatusItems,
    }),
  settings: (host) => settingsPicker(host),
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
  const name = trimmed.slice(1).toLowerCase();
  return !/\s/.test(trimmed) && name in PICKERS;
}
