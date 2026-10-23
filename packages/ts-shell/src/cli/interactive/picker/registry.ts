import { getSlashInvocation } from "../../../entrypoints/slashCommandRegistry.js";
import type { ApprovalTrustPolicy } from "../../../core/shell/approvalTrustPolicy.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { SessionManager } from "../../../session/SessionManager.js";
import type { StatusItemId } from "../../../presentation/tui/chrome/items.js";
import type { SessionMessage } from "../../../session/schema/sessionMessage.js";
import type { RewindPickerInput } from "./rewind.js";
import type { Transcript } from "../../../presentation/tui/transcript/container.js";
import type { Picker } from "../overlay.js";
import type { SessionSelectionContext } from '../../../session/navigation/selection.js';
import { connectionPicker } from "./connections.js";
import { helpPicker } from "./help.js";
import { toolsPicker } from "./tools.js";
import { copyPicker } from "./copy.js";
import { modelPicker } from "./model.js";
import { permissionPicker } from "./permissions.js";
import { pluginPicker } from "./plugins.js";
import { restorePicker } from "./restore.js";
import { rewindPicker } from "./rewind.js";
import { treePicker } from "./tree.js";
import { serverPicker } from "./servers.js";
import { skillPicker } from "./skills.js";
import { sourcePicker } from "./sources.js";
import { sessionPicker } from "./session.js";
import { hubPicker } from "./hub.js";
import { jobsPicker } from "./jobs.js";
import { agentsPicker } from "./agents.js";
import { mcpAddWizard } from "./mcpAdd.js";
import { advisorPicker } from "./advisor.js";
import { thinkingPicker } from "./thinking.js";
import { usagePicker } from "./usage.js";
import { btwPicker } from "./btw.js";
import { planPicker } from "./plan.js";
import { statusItemPicker } from "./statusItems.js";
import { settingsPicker, type SettingsHost } from "./settings.js";
import { undoPicker } from './undo.js';
import type { UndoHost } from '../../../edit/recovery/undo/service.js';
import type { GitWorkbench } from '../../../workflow/git/service.js';
import { gitPicker } from './git.js';
import type { SecurityInspector } from '../../../security/view/inspection.js';
import { cleansePicker } from './cleanse.js';
import { authPicker, type SignInCommand } from './auth.js';
import { debugPicker } from './debug.js';
import type { ExtensionManager } from '../../../extensions/view/model.js';
import type { McpClientSnapshot, ScopedMcpServerConfig } from '../../../core/mcp/types.js';
import type { AgentDefinitionRow, AgentDiscoveryView } from '../../runtime/agents.js';

/**
 * Which commands open a chooser.
 *
 * A command listed here stops printing a catalogue the user has to read and
 * retype, and opens the corresponding picker instead. Everything the picker needs
 * from the host arrives through {@link PickerHost}, so the pickers themselves stay
 * free of session plumbing.
 */

export interface PickerHost extends SettingsHost {
  readonly commandContext: CommandContext;
  readonly transcript: Transcript;
  readonly sessionManager: SessionManager;
  readonly mcpGateway: CliMcpGateway;
  readonly approvalTrustPolicy: ApprovalTrustPolicy;
  readonly projectRoot: string;
  readonly statusItems: readonly StatusItemId[];
  readonly undo: UndoHost;
  readonly gitWorkbench?: GitWorkbench;
  readonly security?: SecurityInspector;
  readonly extensions?: ExtensionManager;
  readonly signIn?: SignInCommand;
  readonly jobs?: import('../../jobs/model.js').JobsComposition;
  readonly agentDefinitions?: () => readonly AgentDefinitionRow[];
  readonly agentDiscovery?: () => AgentDiscoveryView;
  readonly advisorState?: () => import('../../../advisor/model.js').AdvisorState | undefined;
  sessionContext(): SessionSelectionContext;
  resumeSession(sessionId: string, version?: string): Promise<string | undefined>;
  deleteSession(sessionId: string, version?: string): Promise<string | undefined>;
  renameSession(sessionId: string, title: string, version?: string): Promise<string | undefined>;
  pinSession?(sessionId: string, version?: string): Promise<string | undefined>;
  refreshServer(serverName: string, expected: ScopedMcpServerConfig, admission?: () => string | undefined): Promise<McpClientSnapshot>;
  addMcpServer?(scope: 'user' | 'project', name: string,
    definition: { readonly command: string; readonly args: readonly string[] } | { readonly url: string }): Promise<string | undefined>;
  revokeGrant(key: string): Promise<string | undefined>;
  saveStatusItems(items: readonly StatusItemId[]): Promise<string | undefined>;
  /** Show `items` in the band without saving; `undefined` restores the saved band. */
  previewStatusItems(items: readonly StatusItemId[] | undefined): void;
  /** The current session's stored turns, for choosing a point to go back to. */
  sessionTurns(): readonly SessionMessage[] | { readonly turns: readonly SessionMessage[]; readonly version: string };
  /** Navigate by stable identity and return only the confirmed note and draft. */
  readonly rewind: RewindPickerInput['rewind'];
  readonly fork?: (entryId: string, version?: string) => Promise<undefined>;
}

type PickerFactory = (host: PickerHost, argument?: string) => Picker | undefined;

const PICKERS: Record<string, PickerFactory> = {
  help: host => helpPicker(host.commandContext ? { root: host.commandContext.cwd, sessionId: host.commandContext.sessionId } : undefined,
    host.commandContext?.admission),
  tools: (host) => toolsPicker(host.commandContext),
  model: (host) => modelPicker(host.commandContext),
  copy: (host) => copyPicker(host.transcript, host.commandContext),
  resume: host => savedSessionPicker(host, 'resume'),
  pin: host => savedSessionPicker(host, 'pin'),
  mcp: (host) => serverPicker({ gateway: host.mcpGateway, root: host.commandContext.cwd,
    admission: host.commandContext.admission, refresh: host.refreshServer,
    ...(host.addMcpServer ? { add: () => mcpAddWizard(host.addMcpServer!, host.commandContext.admission) } : {}) }),
  connect: (host) => connectionPicker(host.commandContext),
  login: host => authPicker(host.commandContext, 'login', host.signIn),
  logout: host => authPicker(host.commandContext, 'logout'),
  debug: host => debugPicker(host.commandContext),
  permissions: (host) =>
    permissionPicker({
      policy: host.approvalTrustPolicy,
      projectRoot: host.projectRoot,
      revoke: host.revokeGrant,
    }),
  plugin: host => pluginPicker(host.extensions),
  marketplace: (host) => sourcePicker(host.commandContext),
  restore: (host) => restorePicker(host.projectRoot),
  undo: (host) => undoPicker(host.undo),
  skill: (host) => skillPicker(host.commandContext),
  // Reachable either way: `/back`, or Escape twice on an empty prompt. The
  // gesture is fast once known; the command is how it becomes known.
  back: (host, selector) => {
    const admission = host.commandContext?.admission;
    const signal = host.commandContext?.signal;
    let blocked = signal?.aborted ?? false;
    try { blocked ||= admission?.() !== undefined; }
    catch { blocked = true; }
    let turns: readonly SessionMessage[] = [];
    let version: string | undefined;
    let unavailable = false;
    if (!blocked) {
      try {
        const snapshot = host.sessionTurns();
        if ('turns' in snapshot) { turns = snapshot.turns; version = snapshot.version; }
        else turns = snapshot;
      } catch { unavailable = true; }
    }
    return rewindPicker({ turns, version, unavailable, rewind: host.rewind, selector, admission, signal });
  },
  tree: (host) => treePicker(host.commandContext, host.rewind),
  history: (host) => treePicker(host.commandContext, host.rewind, "history"),
  fork: host => treePicker(host.commandContext, point => host.fork?.(point.entryId, point.version) ?? Promise.resolve(undefined), "fork"),
  statusline: (host) =>
    statusItemPicker({
      current: host.statusItems,
      save: host.saveStatusItems,
      preview: host.previewStatusItems,
    }),
  settings: (host) => settingsPicker(host),
  thinking: host => thinkingPicker(host.commandContext),
  hub: host => host.jobs ? hubPicker(host.jobs) : undefined,
  jobs: host => jobsPicker(host.jobs),
  agents: host => agentsPicker(host.agentDefinitions, host.commandContext, host.agentDiscovery, host.jobs),
  usage: host => usagePicker(host.commandContext),
  btw: host => btwPicker(host.transcript),
  'plan-review': host => planPicker(host.sessionManager, host.commandContext),
  advisor: host => {
    const state = host.advisorState?.();
    return state ? advisorPicker(state, host.advisorState) : undefined;
  },
  git: host => gitPicker(host.gitWorkbench),
  cleanse: host => cleansePicker(host.security),
};

function savedSessionPicker(host: PickerHost, action: 'resume' | 'pin'): Picker {
  return sessionPicker({
    sessionManager: host.sessionManager,
    context: host.sessionContext,
    resume: host.resumeSession,
    admission: host.commandContext?.admission,
    pin: host.pinSession,
    action,
    ...(action === 'resume' ? { delete: host.deleteSession, rename: host.renameSession } : {}),
  });
}

/** Arguments belong to the picker when that command explicitly accepts them. */
export function pickerFor(command: string, host: PickerHost): Picker | undefined {
  const [first = "", ...rest] = command.trim().split(/\s+/);
  const invocation = getSlashInvocation(first);
  const name = invocation?.kind === "named" ? invocation.name : invocation?.commandName ?? "";
  return Object.hasOwn(PICKERS, name) ? PICKERS[name]!(host, rest.join(" ")) : undefined;
}

/** Back accepts a selector; other commands keep their direct argument forms. */
export function opensPicker(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return false;
  const invocation = getSlashInvocation(trimmed.slice(1).split(/\s+/)[0]!);
  const name = invocation?.kind === "named" ? invocation.name : invocation?.commandName ?? "";
  return Object.hasOwn(PICKERS, name) && (name === "back" || !/\s/.test(trimmed));
}
