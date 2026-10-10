import { ModelAdmissionError, type RequestPolicy } from '../../../core/agent/request/model.js';

/** Keep the parent's budget owner while attributing every attempt to the exact child run. */
export function agentRequestPolicy(parent: RequestPolicy, jobId: string, runId: string, admission: () => string | undefined, directorId?: string): RequestPolicy {
  const check = () => { if (admission()) throw new ModelAdmissionError('inactive'); };
  const bound = parent.withAdmission?.(check) ?? parent;
  return {
    reserve: request => { check(); return bound.reserve({ ...request, purpose: `${directorId ? `director:${directorId}:` : ''}${request.purpose}/job/${jobId}/run/${runId}` }); },
    withAdmission: extra => agentRequestPolicy(bound.withAdmission?.(extra) ?? bound, jobId, runId, () => { check(); extra(); return undefined; }, directorId),
    withCompletionReserve: reserve => agentRequestPolicy(bound.withCompletionReserve?.(reserve) ?? bound, jobId, runId, admission, directorId),
  };
}
