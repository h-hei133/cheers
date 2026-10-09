import type { ToolDefinition } from '../../tools/types.js';
import { readOnlyAccess } from '../tools/capability.js';
import { matchDenyRule, type DenyRule } from '../shell/approval/deny.js';
import type { ReadOnlyDelegation } from './types.js';

const grants = new WeakSet<ReadOnlyDelegation>();
const local = new Set(['read', 'glob', 'grep']);
const network = new Set(['web_search', 'web_fetch']);

/** Host-created, non-serializable grant. Names alone never authorize delegation. */
export function readOnlyDelegation(input: ReadOnlyDelegation): ReadOnlyDelegation {
  if (!Number.isSafeInteger(input.maxSteps) || input.maxSteps < 1 || input.maxSteps > 24) throw new Error('Invalid delegation step limit.');
  const grant = Object.freeze({ ...input, tools: Object.freeze([...new Set(input.tools)]) });
  grants.add(grant);
  return grant;
}

export function delegationTools(grant: ReadOnlyDelegation, tools: ReadonlyMap<string, ToolDefinition>,
  denyRules: readonly DenyRule[] = [], name = 'read-only task'): readonly string[] {
  if (!grants.has(grant)) throw new Error('A host-issued read-only delegation capability is required.');
  if (matchDenyRule(denyRules, 'task', name)) throw new Error('Delegation is refused by a task deny rule.');
  return grant.tools.filter(name => {
    const tool = tools.get(name);
    const native = tool && readOnlyAccess(tool);
    return tool && !matchDenyRule(denyRules, name, name)
      && (local.has(name) || grant.network && network.has(name) || native && !native.delegation && (!native.network || grant.network));
  });
}
