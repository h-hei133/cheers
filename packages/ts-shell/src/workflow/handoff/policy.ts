import type { RequestPolicy } from '../../core/agent/request/model.js';

/** Preserve the existing budget and attempt owner, adding the exact handoff cycle as provenance. */
export function handoffPolicy(policy: RequestPolicy | undefined, id: string, executing: () => boolean): RequestPolicy | undefined {
  if (!policy) return undefined;
  return {
    reserve: request => policy.reserve({ ...request, purpose: `handoff:${id}:${executing() ? 'execution' : 'planning'}:${request.purpose}` }),
    ...(policy.withAdmission ? { withAdmission: (admit: () => void) => handoffPolicy(policy.withAdmission!(admit), id, executing)! } : {}),
    ...(policy.withCompletionReserve ? { withCompletionReserve: (tokens: () => number) => handoffPolicy(policy.withCompletionReserve!(tokens), id, executing)! } : {}),
  };
}
