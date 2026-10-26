import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { CommandContext } from '../../core/commands/types.js';
import type { RequestPolicy } from '../../core/agent/request/model.js';
import { ResearchRuntime } from '../../research/run/runtime.js';
import { runResearchCommand } from '../../research/command.js';
import { researchTools } from '../../research/run/tools.js';
import { parseResearchArgs, researchAliases } from '../../core/commands/research/syntax.js';
import { takeResearchPreview } from './context/research.js';

const runtimes = new WeakMap<ShellRuntimeContext, ResearchRuntime>();
export function researchFor(context: ShellRuntimeContext, store: SessionManager, renderer: Pick<StreamingRenderer, 'renderLine'>): ResearchRuntime {
  let runtime = runtimes.get(context);
  if (!runtime) { runtime = new ResearchRuntime({ store, current: () => context.session, report: message => renderer.renderLine(message) }); runtimes.set(context, runtime); }
  return runtime;
}
export function researchCommandFor(context: ShellRuntimeContext, store: SessionManager, sessionRuntime: ShellSessionRuntime,
  renderer: Pick<StreamingRenderer, 'renderLine'>): NonNullable<CommandContext['researchCommand']> {
  return async (args, commandContext) => {
    commandContext.signal?.throwIfAborted();
    const active = sessionRuntime.getCurrentRunController();
    const owned = active !== null && active === sessionRuntime.commands.current?.controller && active.signal === commandContext.signal;
    return runResearchCommand(args, commandContext, researchFor(context, store, renderer),
      active !== null && !owned, request => takeResearchPreview(context, request));
  };
}
export function researchRunFor(context: ShellRuntimeContext, store: SessionManager, renderer: Pick<StreamingRenderer, 'renderLine'>,
  inherited?: RequestPolicy) {
  const runtime = researchFor(context, store, renderer);
  const prompt = store.getSession(context.session.id)?.turns.at(-1);
  const runId = prompt?.role === 'user' && prompt.metadata?.source === 'deep-research' ? prompt.metadata.researchRunId : undefined;
  const run = runtime.selected(runId);
  return { requestPolicy: run ? runtime.policy(runId, inherited) : inherited,
    featureTools: researchTools(runtime, runId) };
}
export function researchInspectionTools(context: ShellRuntimeContext) {
  const runtime = runtimes.get(context);
  const run = runtime?.current();
  return researchTools(runtime, run?.id);
}
export function isResearchControl(text: string): boolean {
  const tokens = text.trim().split(/\s+/);
  if (!['/deep-research', ...researchAliases.map(alias => `/${alias}`)].includes(tokens[0]?.toLowerCase() ?? '')) return false;
  const parsed = parseResearchArgs(tokens.slice(1));
  return parsed.ok && ['status', 'dump', 'pause'].includes(parsed.action.name);
}
