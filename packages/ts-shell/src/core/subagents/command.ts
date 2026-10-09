import path from 'node:path';
import { parseAgentsArgs, agentsSyntax } from '../commands/agents/syntax.js';
import { syntaxHelp } from '../commands/syntax/projection.js';
import type { LocalCommandResult } from '../commands/types.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { selectWorkspaceRoot } from '../workspace/roots.js';
import { evaluateToolPermissionScope } from '../query/toolPolicy.js';
import { neutraliseForDisplay } from '../text/safety.js';
import { agentName, formatDefinition, parseDefinition } from './definition.js';
import { definitionIdentity, readAgentFile } from './files.js';
import { SubagentLoader } from './subagentLoader.js';
import { agentPublication } from './publication.js';
import { publishAgent } from './gate.js';
import { revokeChangedRoles } from './admission.js';
import type { SubagentDefinition } from './types.js';

export interface AgentManagementHost {
  readonly root: string; readonly trusted: () => boolean; readonly sourceAccess: (absolute: string) => void;
  readonly gate: () => ToolGateOptions;
}
function report(output: string, status?: string, publication?: string): LocalCommandResult {
  const lines = output.split('\n').map(line => neutraliseForDisplay(line));
  return { kind: 'local', output: lines.join('\n'), report: { version: 1, title: 'Agent definitions', facts: { status: status ?? 'discovered', ...(publication ? { publication } : {}) },
    lines: lines.map(text => ({ kind: 'text', spans: [{ text, role: 'text' }] })) } };
}
function checkTarget(target: string, options: ToolGateOptions): void {
  const refused = options.admission?.(); if (refused) throw new Error(refused);
  for (const name of ['apply_patch', 'write', 'edit', 'read']) {
    const decision = evaluateToolPermissionScope(name, { path: target }, options.permissionScope, options.workspaceRoot, options.denyRules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
/** Management and task dispatch share the existing loader, not an independent catalog. */
export async function runAgentsCommand(args: readonly string[], host: AgentManagementHost): Promise<LocalCommandResult> {
  const parsed = parseAgentsArgs(args);
  if (!parsed.ok) return report(`${parsed.reason}\n${syntaxHelp(agentsSyntax)}`, 'unchanged');
  const action = parsed.action.name; const values = parsed.args; const loader = new SubagentLoader(host.root);
  const options = host.gate(); const refused = options.admission?.(); if (refused) return report(refused, 'unchanged');
  const discovery = loader.discover(host.trusted());
  try {
    if (action === 'list' || action === 'discover') {
      const lines = [...discovery.effective].map(([key, candidate]) => `${candidate.name}: ${candidate.diagnostic ? 'invalid' : candidate.definition?.enabled === false ? 'disabled' : 'enabled'}; source=${candidate.source}${candidate.filePath ? ` ${JSON.stringify(candidate.filePath)}` : ''}; model=${candidate.definition?.model ?? 'inherit'}; effort=${candidate.definition?.effort === null ? 'auto' : candidate.definition?.effort ?? 'inherit'}; shadowed=${discovery.candidates.filter(item => item.name.toLowerCase() === key).length - 1}`);
      return report(['Agent definitions (fresh discovery)', ...lines, ...discovery.diagnostics].join('\n'));
    }
    if (action === 'show') {
      const selected = discovery.effective.get(values[0]!.toLowerCase()); if (!selected) throw new Error('Agent definition was not found.');
      if (selected.filePath) checkTarget(selected.filePath, options);
      const shadows = discovery.candidates.filter(item => item !== selected && item.name.toLowerCase() === selected.name.toLowerCase());
      return report([`Agent ${selected.name}; source=${selected.source}; ${selected.filePath ?? 'read-only builtin'}; ${selected.diagnostic ?? (selected.definition?.enabled === false ? 'disabled' : 'enabled')}`,
        ...shadows.map(item => `Shadowed: ${item.source} ${item.filePath ?? 'builtin'}${item.diagnostic ? ` (${item.diagnostic})` : ''}`),
        selected.raw ?? (selected.definition ? formatDefinition(selected.definition) : 'Invalid definition; use scoped edit with a valid Markdown file.')].join('\n'));
    }
    let target: string; let next: string | undefined; let inherited: SubagentDefinition | undefined;
    let inputSnapshot: { readonly path: string; readonly identity: string } | undefined;
    if (action === 'export') {
      const selected = discovery.effective.get(values[0]!.toLowerCase()); if (!selected?.definition) throw new Error('Select a valid agent to export.');
      target = path.resolve(host.root, values[1]!); selectWorkspaceRoot(host.root, options.workspaceRoots ?? [], target, 'write');
      if (selected.filePath) checkTarget(selected.filePath, options);
      next = selected.raw ?? formatDefinition(selected.definition); inherited = selected.definition;
    } else {
      const scope = values[0] as 'user' | 'project'; const name = agentName(values[1]!);
      if (scope === 'project' && !host.trusted()) throw new Error('Project agent modification is refused in an untrusted workspace.');
      const scoped = discovery.candidates.filter(item => item.source === scope && item.name.toLowerCase() === name.toLowerCase()).at(-1);
      target = scoped?.filePath ?? path.join(scope === 'user' ? loader.userAgentsDir : path.join(host.root, '.agents'), `${name.toLowerCase()}.md`);
      if (action === 'create' || action === 'import' || action === 'edit') {
        if (action === 'edit' ? !scoped : !!scoped) throw new Error(action === 'edit' ? 'No definition exists in the selected scope.' : 'An agent already exists in this scope; use edit.');
        const input = path.resolve(host.root, values[2]!); host.sourceAccess(input); const raw = readAgentFile(input);
        if (raw === undefined) throw new Error('Agent input file was not found.');
        const definition = parseDefinition(raw, scope);
        inputSnapshot = { path: input, identity: definitionIdentity(input, raw) };
        if (definition.name.toLowerCase() !== name.toLowerCase()) throw new Error('Input definition name must match the requested agent.');
        next = raw;
      } else if (action === 'delete') {
        if (!scoped) throw new Error('No scoped override exists; builtin definitions are read-only.');
        next = undefined;
      } else {
        const base = scoped ?? discovery.effective.get(name.toLowerCase()); if (!base?.definition) throw new Error('Select a valid agent definition first.');
        inherited = base.definition;
        let definition: SubagentDefinition = { ...base.definition, source: scope };
        if (action === 'enable' || action === 'disable') definition = { ...definition, enabled: action === 'enable' };
        else if (action === 'model') definition = { ...definition, model: values[2] === 'inherit' ? undefined : values[2] };
        else if (action === 'effort') definition = { ...definition, effort: values[2] === 'inherit' ? undefined : values[2] === 'auto' ? null : values[2] as 'low' | 'medium' | 'high' };
        next = formatDefinition(definition); parseDefinition(next, scope);
      }
    }
    checkTarget(target, options);
    const admission = () => {
      try {
        checkTarget(target, options);
        if (values[0] === 'project' && !host.trusted()) return 'Project trust changed before agent publication.';
        if (inherited) {
          const fresh = loader.discover(host.trusted());
          const name = (action === 'export' ? values[0] : values[1])!.toLowerCase();
          const scoped = action === 'export' ? undefined : fresh.candidates.filter(item => item.source === values[0] && item.name.toLowerCase() === name).at(-1);
          if ((scoped ?? fresh.effective.get(name))?.definition?.identity !== inherited.identity) return 'FILE_CONTENT_CHANGED: agent source changed before publication.';
        }
        if (inputSnapshot) {
          host.sourceAccess(inputSnapshot.path); const current = readAgentFile(inputSnapshot.path);
          if (current === undefined || definitionIdentity(inputSnapshot.path, current) !== inputSnapshot.identity) return 'FILE_CONTENT_CHANGED: agent input changed before publication.';
        }
        return undefined;
      } catch (error) { return error instanceof Error ? error.message : 'Agent publication admission refused.'; }
    };
    const currentAdmission = () => {
      try { checkTarget(target, options); return values[0] === 'project' && !host.trusted() ? 'Project trust changed after agent publication.' : undefined; }
      catch (error) { return error instanceof Error ? error.message : 'Current agent publication admission refused.'; }
    };
    const tool = agentPublication(target, next, admission, currentAdmission);
    const result = await publishAgent(tool, { ...options, admission });
    if (result.isError) {
      const status = String(result.metadata?.status ?? 'unchanged');
      const cancellation = status === 'unchanged' ? '' : await revokeChangedRoles();
      return report([result.output, cancellation].filter(Boolean).join('\n'), status,
        typeof result.metadata?.publication === 'string' ? result.metadata.publication : undefined);
    }
    const cancellation = await revokeChangedRoles();
    const effective = loader.discover(host.trusted()).effective.get((action === 'export' ? values[0] : values[1])!.toLowerCase());
    return report([result.output, cancellation, action === 'export' ? 'Exported definition; role dispatch is unchanged.' : `Next task uses fresh discovery; effective source=${effective?.source ?? 'none'}; ${effective?.definition?.enabled === false ? 'disabled' : effective?.diagnostic ? 'invalid' : 'enabled'}.`].join('\n'), 'persisted');
  } catch (error) { return report(error instanceof Error ? error.message : 'Agent operation refused or unverified.', 'unchanged'); }
}
