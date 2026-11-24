import type { ConfigPublication } from '../../config/state.js';
import type { ProviderCredentialResolution } from '../../core/auth/credential.js';
import { MCP_TOOL_PREFIX } from '../../core/mcp/projection.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { PermissionScope } from '../../core/shell/approval/scope.js';
import { DISCOVERED_TOOL_LIMIT } from '../../core/tools/discovery/state.js';

const EMPTY = Object.freeze([] as string[]);
const retained = new WeakMap<ShellRuntimeContext, {
  readonly publication: ConfigPublication;
  readonly scope: string;
  readonly names: readonly string[];
}>();

/** Retain names for a live runtime. The next run acquires fresh definitions and reapplies visibility. */
export function discoveryLoadout(context: ShellRuntimeContext, resolution: ProviderCredentialResolution, permission: PermissionScope) {
  const publication = context.configuration.current;
  const workspaceRevision = context.workspaceRevision;
  const { session, cwd, projectRoot } = context;
  const scope = JSON.stringify([session.id, session.createdAt, cwd, projectRoot, workspaceRevision, permission,
    resolution.provider, resolution.model, resolution.baseUrl, resolution.credential?.connectionId]);
  const current = (): boolean => context.configuration.current === publication && context.workspaceRevision === workspaceRevision
    && context.session.id === session.id && context.session.createdAt === session.createdAt
    && context.projectRoot === projectRoot && context.cwd === cwd;
  return {
    read: (): readonly string[] => {
      const snapshot = retained.get(context);
      return current() && snapshot?.publication === publication && snapshot.scope === scope ? snapshot.names : EMPTY;
    },
    write: (names: readonly string[]): void => {
      if (!current()) return;
      const local = names.filter(name => name !== 'codemode' && !name.startsWith(MCP_TOOL_PREFIX)).slice(0, DISCOVERED_TOOL_LIMIT);
      const last = retained.get(context);
      if (last?.publication === publication && last.scope === scope && last.names.length === local.length
        && last.names.every((name, index) => name === local[index])) return;
      retained.set(context, { publication, scope, names: Object.freeze(local) });
    },
  };
}
