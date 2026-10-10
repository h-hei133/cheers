import type { RequestPolicy } from '../../core/agent/request/model.js';

/** Add preset provenance while retaining the ordinary attempt and budget owner. */
export function directorPolicy(policy: RequestPolicy | undefined, id: string): RequestPolicy | undefined {
  if (!policy) return undefined;
  return { reserve: request => policy.reserve({ ...request, purpose: `director:${id}:${request.purpose}` }),
    ...(policy.withAdmission ? { withAdmission: (admit: () => void) => directorPolicy(policy.withAdmission!(admit), id)! } : {}),
    ...(policy.withCompletionReserve ? { withCompletionReserve: (tokens: () => number) => directorPolicy(policy.withCompletionReserve!(tokens), id)! } : {}) };
}
