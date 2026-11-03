import type { AgentMessage } from '../../core/agent/state.js';
import type { PromptIdentitySnapshot } from '../../observability/usage/model.js';
import type { CompactionPolicy } from '../../session/compaction.js';

export interface CompactionMeasurement {
  readonly source: 'measured' | 'estimated';
  readonly reason?: string;
}

export function createCompactionMeasurement(revision: () => readonly unknown[] = () => []) {
  let scope: object | undefined;
  let latest: CompactionMeasurement | undefined;
  let observed: readonly unknown[] | undefined;
  const reset = (next: object) => { scope = next; latest = undefined; observed = undefined; };
  const observe = (owner: object, value: number | undefined) => {
    if (owner !== scope) return;
    observed = revision();
    if (latest?.source === (value === undefined ? 'estimated' : 'measured')) return;
    latest = value === undefined
      ? { source: 'estimated', reason: 'The compaction evaluator could not use a current provider measurement.' }
      : { source: 'measured' };
  };
  const wrap = (policy: CompactionPolicy, owner: object): CompactionPolicy => {
    const original = policy.measureContextTokens;
    if (!original) return policy;
    const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(policy);
    descriptors.measureContextTokens = {
      configurable: true,
      enumerable: Object.prototype.propertyIsEnumerable.call(policy, 'measureContextTokens'),
      writable: true,
      value: (messages: readonly AgentMessage[], identity?: PromptIdentitySnapshot, toolsAllowed?: boolean) => {
        const result = original.call(policy, messages, identity, toolsAllowed);
        observe(owner, result);
        return result;
      },
    };
    return Object.create(Object.getPrototypeOf(policy), descriptors) as CompactionPolicy;
  };
  return {
    reset,
    wrap,
    read: (owner: object): CompactionMeasurement | undefined => {
      if (owner !== scope || !latest || !observed) return undefined;
      const current = revision();
      if (current.length !== observed.length || current.some((value, index) => value !== observed![index])) {
        latest = undefined; observed = undefined;
      }
      return latest;
    },
  };
}
