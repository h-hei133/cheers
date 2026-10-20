import { CollaborationHost } from '../../collaboration/client/host.js';
import { CollaborationGuest } from '../../collaboration/client/guest.js';
import { decodeAcl } from '../../collaboration/contract/acl.js';
import { digest, identifier, object, parseJson, requireValue } from '../../collaboration/contract/value.js';
import type { CollaborationComposition } from './model.js';
import { currentBinding, display, snapshotFor, snapshotPreview, aclPreview } from './projection.js';
import { approveOperation } from './approval.js';
import { invalidateCollaborationAdmission, updateCollaborationAdmission } from './acceptance.js';

export async function startHost(host: CollaborationComposition, aclSource: string | undefined, resume?: string, signal?: AbortSignal): Promise<string> {
  requireValue(host.client && (!host.host || host.host.status() !== 'hosting'), 'busy');
  const client = host.client; const bound = currentBinding(host); const snapshot = snapshotFor(host);
  const plan = resume ? object((await client.request('room-plan', { roomId: identifier(resume), data: bound }, false, signal)).result) : undefined;
  const acl = plan ? decodeAcl(plan.acl) : decodeAcl(parseJson(aclSource ?? '{}', 8192));
  const result = await approveOperation(host, resume ? 'resume host' : 'start host',
    `${resume ? 'Reacquire expired room ' + identifier(resume) : 'Create authenticated room'} on ${client.profile.origin}\nPrincipal: ${client.profile.principal}\nSession: ${bound.sessionId}; project identity: ${bound.projectId}\nACL recipients and rights:\n${aclPreview(acl)}\n${plan ? `Retained ACL revision ${plan.aclRevision}, host generation ${plan.generation} and service epoch ${plan.epoch} must still match. Prior capabilities/tickets are fenced.` : ''}\nFuture complete scrubbed transcript snapshots and fixed lifecycle metadata will be disclosed to these principals until stop/revocation. Raw chunks, reasoning, tool arguments and attachments are omitted.\n${snapshotPreview(snapshot)}`, async context => {
      const response = await client.request(resume ? 'lease' : 'begin', { ...(resume ? { roomId: resume } : {}),
        data: { binding: bound, snapshot, ...(plan ? { epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } : { acl }) } }, true, context.abortSignal);
      await host.host?.close(false); host.bound = bound;
      const current = (): boolean => host.host === created && digest(currentBinding(host)) === digest(bound) && host.client === client;
      const created: CollaborationHost = new CollaborationHost(client, bound, response.result, { current,
        observe: callback => host.runtime.observeEvents(callback, { renders: false }), snapshot: cutover => snapshotFor(host, cutover),
        invalid: () => { if (host.host === created) invalidateCollaborationAdmission(host); },
        updated: (proposals, expiresAt) => { if (current()) updateCollaborationAdmission(host, proposals, expiresAt); } });
      host.host = created; created.start();
      return { success: true, output: `Hosting room ${host.host.roomId} on ${client.profile.origin}; generation ${host.host.owner.generation}. Observation, proposals and local approval remain separate.`, metadata: { status: 'hosting', roomId: host.host.roomId } };
    });
  return result.output;
}
export async function joinRoom(host: CollaborationComposition, roomId: string, signal?: AbortSignal): Promise<string> {
  requireValue(host.client, 'unavailable'); identifier(roomId); const client = host.client; const bound = digest(currentBinding(host));
  const result = await approveOperation(host, 'join', `Observe authenticated room ${roomId} at ${client.profile.origin} as ${client.profile.principal}.\nThe remote room does not attach a local workspace or grant tools. One bounded polling request receives scrubbed snapshots/metadata; its exact room/service identity and cursor persist privately.`, async context => {
    const response = await client.request('join', { roomId, data: {} }, false, context.abortSignal ?? signal); host.guest?.close();
    host.guest = new CollaborationGuest(client, bound, response.result, () => digest(currentBinding(host)) === bound && host.client === client);
    await host.guest.poll(context.abortSignal ?? signal); host.guest.start();
    return { success: true, output: `Observing room ${host.guest.roomId}; no model or tool was dispatched. Use /collab events for the bounded received projection.`, metadata: { status: 'observing', roomId } };
  });
  return result.output;
}
export async function changeRights(host: CollaborationComposition, principal: string, selected: string | undefined, signal?: AbortSignal): Promise<string> {
  requireValue(host.host, 'unavailable'); principal = identifier(principal);
  const rights = selected ? selected.split(',') : []; decodeAcl({ [principal]: rights });
  const result = await approveOperation(host, 'change ACL', `Room ${host.host.roomId} at ${host.client!.profile.origin}\nPrincipal ${principal}: ${rights.join(',') || 'no rights'}.\nObserve, ask and control are independently checked. Control never supplies model/tool approval. Existing tickets are fenced and active revoked remote work is canceled on the next host heartbeat (or earlier local observation).`, async context => {
    const response = await host.host!.request('acl', { principal, rights }, true, context.abortSignal ?? signal);
    if (!rights.includes('ask') && host.active?.acceptance.principal === principal) host.active.controller.abort();
    for (const [id, acceptance] of host.accepted) if (acceptance.principal === principal && !rights.includes('ask')) host.accepted.delete(id);
    return { success: true, output: `ACL publication: ${display(response.result)}`, metadata: { status: 'persisted' } };
  }); return result.output;
}
export async function stopHost(host: CollaborationComposition, signal?: AbortSignal): Promise<string> {
  requireValue(host.host, 'unavailable'); const roomId = host.host.roomId;
  const result = await approveOperation(host, 'stop host', `Close room ${roomId}, revoke every ticket and host capability, and stop its event observer. Active remote-origin work is canceled; other local work keeps its own owner.`, async context => {
    await host.host!.close(true, context.abortSignal ?? signal); return { success: true, output: `Room ${roomId} closed and fenced.`, metadata: { status: 'closed' } };
  }); return result.output;
}
export async function proposeRemote(host: CollaborationComposition, kind: 'ask' | 'cancel', value: string, signal?: AbortSignal): Promise<string> {
  requireValue(host.guest, 'unavailable');
  const result = await approveOperation(host, kind === 'ask' ? 'propose prompt' : 'propose cancellation',
    `Send ${kind} proposal to room ${host.guest.roomId} at ${host.client!.profile.origin} as ${host.client!.profile.principal}.\nThis cannot start a model/tool or cancel a run until the host explicitly approves the exact proposal.\nDigest: ${digest({ kind, ...(kind === 'ask' ? { text: value } : { target: value }) })}\n${display(value)}`, async context => {
      const response = await host.guest!.propose(kind, value, context.abortSignal ?? signal);
      return { success: true, output: `Proposal sent: ${display(response)}; execution not started.`, metadata: { status: 'proposed' } };
    }); return result.output;
}
