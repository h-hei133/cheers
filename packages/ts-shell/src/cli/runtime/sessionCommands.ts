import type { CommandContext, CommandExecutionResult, LocalCommandResult } from '../../core/commands/types.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import { prepareSessionManagement, applySessionManagement } from '../../session/lifecycle/management.js';
import type { SessionSelectionContext } from '../../session/navigation/selection.js';
import { sessionSyntax, parseSessionArgs, type SessionCommandName } from '../../core/commands/navigation/operations.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { redactUnsafeReportText } from '../../core/security/reportText.js';
import { readSessionNavigation } from '../../session/query/navigation.js';
import { exportHistory, parseHistory } from '../../session/history/model.js';
import { importHistory } from '../../session/history/import.js';
import { planContextSelection, decodeContextSelection, type ContextSelectionMode } from '../../session/context/selection.js';
import type { CommandDataTransfer } from '../../core/commands/transfer/contract.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { updateContextSelection } from '../../session/context/state.js';

type SessionCommandInput = {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly sessionRuntime: Pick<ShellSessionRuntime, 'getCurrentRunController'>;
  readonly dataTransfer?: CommandDataTransfer;
};

export function sessionCommandFor(input: {
  readonly runtimeContext: ShellRuntimeContext;
  readonly sessionManager: SessionManager;
  readonly sessionRuntime: Pick<ShellSessionRuntime, 'getCurrentRunController'>;
  readonly dataTransfer?: CommandDataTransfer;
}): CommandContext['sessionCommand'] {
  return async (name, args) => runSessionCommand(name, args, input);
}

async function runSessionCommand(
  name: SessionCommandName,
  args: readonly string[],
  input: SessionCommandInput,
): Promise<CommandExecutionResult> {
  // Direct and /session forms both receive arguments without the command name.
  const syntax = sessionSyntax[name];
  const parsed = parseSessionArgs(name, args);
  if (!parsed.ok) return local(`Invalid /${name} arguments: ${parsed.reason}\n${syntaxHelp(syntax)}`);
  if (name === 'pin') return pinSession(parsed.args, input);
  if (name === 'history') return historyCommand([parsed.action.name, ...parsed.args], input);
  if (name === 'import') return importCommand(parsed.args, input);
  if (name === 'open') return openCommand(parsed.action.name === 'list' ? ['list'] : parsed.args, input);
  return shakeCommand([parsed.action.name, ...parsed.args], input);
}

function selectionContext(input: Pick<SessionCommandInput, 'runtimeContext' | 'sessionRuntime'>): SessionSelectionContext {
  return { sessionId: input.runtimeContext.session.id, projectRoot: input.runtimeContext.projectRoot,
    busy: input.sessionRuntime.getCurrentRunController() !== null };
}

async function pinSession(args: readonly string[], input: SessionCommandInput): Promise<LocalCommandResult> {
  const reference = args;
  const target = reference[0] && reference[0].toLowerCase() !== 'here' ? reference[0] : input.runtimeContext.session.id;
  const selected = reference[1] === undefined ? undefined : reference[1].toLowerCase() === 'on' ? true : reference[1].toLowerCase() === 'off' ? false : null;
  if (selected === null) return local('Invalid pin state. Use on or off.');
  const prepared = await prepareSessionManagement(input.sessionManager, () => selectionContext(input), 'pin', target);
  if (!prepared.preview) return local(prepared.note);
  const result = applySessionManagement(input.sessionManager, () => selectionContext(input), prepared.preview, undefined, selected);
  return local(result.note, { status: result.status });
}

async function historyCommand(args: readonly string[], input: SessionCommandInput): Promise<LocalCommandResult> {
  const action = args[0]?.toLowerCase() || 'list';
  if (action === 'list') {
    try {
      const navigation = readSessionNavigation(input.runtimeContext.session.id, input.runtimeContext.cwd);
      const lines = navigation.points.map(point => `${'  '.repeat(point.depth)}- ${point.current ? '* ' : ''}${point.entryId} ${point.label}`);
      return local(['Session history', '', ...lines, '', 'Branches remain persisted; use /tree <entry-id> to continue from a point.'].join('\n'));
    } catch (error) { return local(`History is unavailable: ${safe(error)}`); }
  }
  if (action !== 'export') return local('Usage: /history [list|export <path>]');
  const destination = args[1];
  if (!destination) return local('Usage: /history export <path>');
  if (!input.dataTransfer) return local('History export is blocked: file authority is unavailable.');
  try {
    const content = exportHistory(input.runtimeContext.session.id, input.runtimeContext.projectRoot, input.runtimeContext.session.title);
    const result = await input.dataTransfer.write({ path: destination, content });
    return local(`History export ${result.outcome}.${result.reason ? ` ${result.reason}` : ''}`, { status: result.outcome });
  } catch (error) { return local(`History export failed: ${safe(error)}`); }
}

async function importCommand(args: readonly string[], input: SessionCommandInput): Promise<LocalCommandResult> {
  const source = args[0];
  if (!source) return local('Usage: /import <path>');
  if (!input.dataTransfer) return local('History import is blocked: file authority is unavailable.');
  const read = await input.dataTransfer.read({ path: source, maxBytes: 2 * 1024 * 1024 });
  if (read.outcome !== 'read') return local(`History import ${read.outcome}: ${read.reason}`);
  try {
    const document = parseHistory(read.content);
    const result = importHistory(document, input.runtimeContext.projectRoot, configurationAdmission(input.runtimeContext));
    return local(`History import ${result.reused ? 'reused' : 'committed'} as inactive session ${result.id}. No write authority was inherited.`, { status: result.reused ? 'unchanged' : 'committed' });
  } catch (error) { return local(`History import failed: ${safe(error)}`); }
}

async function openCommand(args: readonly string[], input: SessionCommandInput): Promise<LocalCommandResult> {
  const session = input.sessionManager.getSession(input.runtimeContext.session.id) ?? input.runtimeContext.session;
  const text = session.turns.map(turn => typeof turn.content === 'string' ? turn.content : JSON.stringify(turn.content)).join('\n');
  const links = [...new Set(text.match(/https?:\/\/[^\s<>()]+/g) ?? [])].slice(0, 64);
  if (args[0]?.toLowerCase() === 'list' || !args[0]) return local(links.length ? ['Conversation links', ...links.map((link, index) => `${index + 1}. ${redactUnsafeReportText(link, undefined, 2048)}`)].join('\n') : 'No links are present in the saved conversation.');
  const index = Number(args[0]);
  if (!Number.isInteger(index) || index < 1 || index > links.length) return local(`No conversation link ${args[0] ?? ''}. Run /open list first.`);
  const link = links[index - 1]!;
  try {
    const parsed = new URL(link);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return local(`Selected conversation link ${index} uses a blocked protocol (${parsed.protocol}).`, { status: 'blocked' });
    }
    if (!input.dataTransfer?.openLink) return local('Opening links is unavailable: this host has no approved system opener.', { status: 'blocked' });
    const result = await input.dataTransfer.openLink({ url: parsed.href });
    return local(`Conversation link ${index}: ${result.outcome}.${result.reason ? ` ${result.reason}` : ''}`, { status: result.outcome });
  } catch (error) {
    return local(`Conversation link ${index} could not be opened: ${safe(error)}`, { status: 'blocked' });
  }
}

async function shakeCommand(args: readonly string[], input: SessionCommandInput): Promise<LocalCommandResult> {
  const action = args[0]?.toLowerCase() || 'preview';
  if (action === 'status') {
    const selection = decodeContextSelection(input.runtimeContext.session.contextSelection);
    return local(`Context selection revision ${selection.revision}: ${selection.entries.length} entries selected.`);
  }
  const mode = (args[1] || 'elide').toLowerCase() as ContextSelectionMode;
  if (!['elide', 'images', 'thinking'].includes(mode)) return local('Usage: /shake [preview|apply|status|restore] [elide|images|thinking]');
  try {
    if ((action === 'apply' || action === 'restore') && input.sessionRuntime.getCurrentRunController() !== null) return local('Context selection is blocked while a turn is running.');
    const current = input.sessionManager.getSession(input.runtimeContext.session.id);
    if (!current) return local('The current saved session is unavailable.');
    if (action === 'restore') {
      input.runtimeContext.session = updateContextSelection(input.sessionManager, current, undefined, configurationAdmission(input.runtimeContext));
      return local('Context selection restored; original history remains intact.', { status: 'changed' });
    }
    const planned = planContextSelection(current, mode);
    if (action !== 'apply') return local(`Context preview: ${planned.changed} messages, about ${planned.estimatedTokens} tokens omitted; ${planned.signed} signed reasoning items protected.`);
    input.runtimeContext.session = updateContextSelection(input.sessionManager, current, planned.selection, configurationAdmission(input.runtimeContext));
    return local(`Context selection applied at revision ${planned.selection.revision}; ${planned.changed} messages affected. Original history remains available.`, { status: 'changed' });
  } catch (error) { return local(`Context selection failed: ${safe(error)}`); }
}

function local(output: string, state?: Record<string, unknown>): LocalCommandResult { return { kind: 'local', output, ...(state ? { state } : {}) }; }
function safe(error: unknown): string { return redactUnsafeReportText(error instanceof Error ? error.message : 'unknown error', undefined, 1024); }
