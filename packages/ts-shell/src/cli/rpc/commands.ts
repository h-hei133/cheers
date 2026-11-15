import { catalogContributions } from '../../core/catalog/contributions.js';
import { commandInvocations } from '../../core/commands/invocation.js';
import { listVisibleCommands } from '../../core/commands/registry.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { resolveSkillCatalog } from '../../core/skills/skillCatalog.js';
import type { RpcCommandSnapshot } from './protocol.js';
import type { Skill } from '../../core/skills/skillLoader.js';

const DISCOVERY_TIMEOUT_MS = 30_000;

/** Discover through the same session registrations, invocation spellings and skill policy as dispatch. */
export async function listRpcCommands(context: ShellRuntimeContext, parent?: AbortSignal): Promise<RpcCommandSnapshot> {
  const session = context.session, active = context.activeSession, cwd = context.cwd, root = context.projectRoot;
  const publication = context.configuration.current, options = context.skillOptions;
  const signal = AbortSignal.any([context.configuration.backgroundSignal, AbortSignal.timeout(DISCOVERY_TIMEOUT_MS), ...(parent ? [parent] : [])]);
  const contributions = catalogContributions(cwd, session.id);
  const selectedSkills: Skill[] = [];
  let verify: (() => void) | undefined;
  const assertBinding = () => {
    signal.throwIfAborted();
    if (context.session !== session || context.activeSession !== active || context.cwd !== cwd || context.projectRoot !== root
      || context.configuration.current !== publication || context.skillOptions !== options) throw new Error();
    const current = catalogContributions(cwd, session.id);
    if (current.length !== contributions.length || contributions.some((entry, index) => current[index] !== entry)) throw new Error();
  };
  const assertCurrent = () => {
    try {
      assertBinding();
      if (selectedSkills.some(skill => skill.isCurrent?.() === false)) throw new Error();
      verify?.();
      assertBinding();
    } catch {
      throw new Error('Command discovery is no longer current. Retry get_commands.');
    }
  };
  try {
    const catalog = await resolveSkillCatalog({ workspaceRoot: cwd, sessionId: session.id, ...options, abortSignal: signal });
    verify = catalog.verify; assertCurrent();
    const commands = [...listVisibleCommands(cwd, publication.config), ...contributions.flatMap(entry => entry.commands)];
    const result = new Map<string, Record<string, unknown>>();
    for (const command of commands) for (const invocation of commandInvocations(command)) {
      if (result.has(invocation.name)) continue;
      result.set(invocation.name, { name: invocation.name, description: invocation.summary,
        ...(invocation.kind === 'command' && command.aliases ? { aliases: [...command.aliases] } : {}) });
    }
    for (const skill of catalog.skills.values()) if (skill.isCurrent?.() !== false) {
      const name = `skill:${skill.name}`;
      if (!result.has(name)) { selectedSkills.push(skill); result.set(name, { name, description: skill.description }); }
    }
    assertCurrent();
    return { commands: [...result.values()], assertCurrent };
  } catch { throw new Error('Command discovery was cancelled or unavailable. Retry get_commands.'); }
}
