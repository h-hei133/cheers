import type { CommandContext, LocalCommandResult } from '../../core/commands/types.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { directorSyntax } from '../../core/commands/director/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { parseEffortFlag } from '../../core/commands/model/preference.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { readGoalEdit } from '../../planning/goal/store.js';
import { HandoffStore } from '../../workflow/handoff/store.js';
import { DirectorStore } from '../../workflow/director/store.js';
import { runPreparedTool } from '../../turn/invoke.js';
import type { JobsComposition } from '../jobs/model.js';
import { jobAdmission } from '../jobs/authority.js';
import { agentProjection } from '../jobs/agent/projection.js';
import { report } from '../jobs/projection.js';
import { executionChoice, sourceChoice } from '../provider/selection.js';
import { DirectorRuntime } from './lifetime.js';
import { liveDirectors } from './state.js';
import { workerEffects } from './effects.js';
import { workerObservations } from './observation.js';

export async function runDirectorCommand(host: JobsComposition, args: string[], context: CommandContext): Promise<LocalCommandResult> {
  try {
    const raw = context.rawCommandArgs; const spawn = raw && /^\s*spawn\s+(?:--\s+)?([\s\S]*)$/i.exec(raw);
    const send = raw && /^\s*send\s+(\S+)\s+(?:--\s+)?([\s\S]*)$/i.exec(raw);
    const tokens = spawn ? ['spawn', '--', spawn[1]!] : send ? ['send', send[1]!, '--', send[2]!]
      : raw === undefined ? args : tokenizeCommandArgs(raw);
    const parsed = parseSyntax(directorSyntax, tokens);
    if (!parsed.ok) return { kind: 'local', output: `Invalid /director arguments: ${parsed.reason}\n${syntaxHelp(directorSyntax)}` };
    const store = new DirectorStore(host.manager, host.session); const cycles = store.read().cycles;
    if (parsed.action.name === 'status') return { kind: 'local', output: report({ completionProof: false, cycles: cycles.map(row => ({
      id: row.id, phase: row.phase === 'enabled' && liveDirectors.get(host.context)?.row.id !== row.id ? 'unknown' : row.phase,
      storedPhase: row.phase, retired: row.retired === true, sourceModel: row.source.model, workerModel: row.worker.model,
      workerEffort: row.worker.thinkingEffort, workers: row.workers.map(id => agentProjection(host, host.agents.journal.get(id))) })) }) };
    if (parsed.action.name === 'off') {
      const live = liveDirectors.get(host.context);
      if (live && live.host === host) return { kind: 'local', output: await live.close() };
      if (live) await live.close();
      const pending = cycles.find(row => !row.retired && row.phase !== 'disabled');
      if (!pending) return { kind: 'local', output: 'Director is off.' };
      store.change(pending, { phase: 'unknown', retired: true, ...(pending.endedAt === undefined ? { endedAt: Date.now() } : {}) });
      return { kind: 'local', output: 'Director off; the earlier owner is unavailable. Retained workers remain unknown and are not adopted or replayed.' };
    }
    if (['on', 'spawn', 'send', 'stop'].includes(parsed.action.name) && host.runtime.getCurrentRunController())
      throw new Error('Wait for the main turn or approval to settle before changing or assigning workers. /director off may revoke it now.');
    if (parsed.action.name === 'on') {
      const refused = jobAdmission(host, 'task')(); if (refused) throw new Error(refused);
      if (host.runtime.getAgentMode() !== 'build' || readGoalEdit(host.manager, host.session).goal?.phase === 'active'
        || new HandoffStore(host.manager, host.session).read().cycles.some(row => !row.retired && ['armed', 'running', 'switched', 'unknown'].includes(row.phase)))
        throw new Error('Director requires build mode with no active goal or unresolved model handoff.');
      const original = host.agentRuntimeInput?.providerRuntimeBridge.resolveCredentialSnapshot();
      if (!original) throw new Error('The bound worker provider is unavailable.');
      const { config, catalog } = host.context.configuration.current; const source = sourceChoice(host.context.cwd, original);
      const model = parsed.flags.get('model'); const effort = parseEffortFlag(parsed.flags.get('effort'));
      const worker = executionChoice(typeof model === 'string' ? model : `${source.provider}/${source.model}`, effort, source, original, config, catalog);
      const directory = captureWorkspaceRoot(host.context.cwd, host.context.cwd, 'read');
      const runtime = new DirectorRuntime(host, store.enable(source, worker, { path: directory.path, identity: directory.identity }));
      liveDirectors.set(host.context, runtime);
      const changed = runtime.admission(); if (changed) { await runtime.close(); throw new Error(changed); }
      return { kind: 'local', output: `Director on; worker model ${worker.provider}/${worker.model}, effort ${worker.thinkingEffort ?? 'auto'}. Main tools are restricted to reading and worker management. Workers start only after explicit delegation approval; each effect retains its ordinary approval.` };
    }
    const owner = liveDirectors.get(host.context); if (!owner || owner.host !== host || owner.admission()) throw new Error('No live adoptable director. Inspect status and use off/on explicitly.');
    const name = parsed.action.name === 'spawn' ? 'worker_start' : `worker_${parsed.action.name}`;
    const tools = [...workerEffects(owner), ...workerObservations(owner)]; const tool = tools.find(tool => tool.name === name);
    if (!tool) throw new Error('The requested worker operation is unavailable.');
    const input = parsed.action.name === 'spawn' ? { prompt: parsed.args[0] } : parsed.action.name === 'send' ? { id: parsed.args[0], prompt: parsed.args[1] }
      : parsed.action.name === 'output' ? { id: parsed.args[0], offset: Number(parsed.args[1]) }
        : parsed.action.name === 'wait' ? { id: parsed.args[0], ...(parsed.args[1] ? { seconds: Number(parsed.args[1]) } : {}) } : { id: parsed.args[0] };
    const result = await runPreparedTool(tool, input, { ...host.gate('task'), admission: owner.admission }, undefined, undefined, 'Worker', { eventKey: 'director' });
    return { kind: 'local', output: result.output };
  } catch (error) { return { kind: 'local', output: `Director refused or unverified: ${report(error instanceof Error ? error.message : 'state unavailable')}` }; }
}
