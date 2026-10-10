import type { CommandExecutionResult } from '../../core/commands/types.js';
import type { Acceptance, Proposal } from '../../collaboration/contract/model.js';
import { digest, identifier, object, requireValue, text, uuid } from '../../collaboration/contract/value.js';
import type { CollaborationComposition } from './model.js';
import { currentBinding, display, promptPreview } from './projection.js';
import { approveOperation } from './approval.js';

export async function inspectRemoteProposal(host: CollaborationComposition, proposalId: string): Promise<Proposal> {
  requireValue(host.host, 'unavailable'); uuid(proposalId);
  const value = object((await host.host.request('inspect-proposal', { proposalId }, false)).result);
  requireValue(value.id === proposalId && (value.kind === 'ask' || value.kind === 'cancel')
    && typeof value.principal === 'string' && value.digest === digest({ kind: value.kind, text: value.text, target: value.target }), 'stale');
  identifier(value.principal);
  if (value.kind === 'ask') { text(value.text, 16 * 1024); requireValue(value.target === undefined, 'stale'); }
  else { uuid(value.target); requireValue(value.text === undefined, 'stale'); }
  return value as unknown as Proposal;
}
export async function acceptRemoteProposal(host: CollaborationComposition, proposalId: string): Promise<CommandExecutionResult> {
  const proposal = await inspectRemoteProposal(host, proposalId); const owner = host.host!;
  requireValue(proposal.status === 'proposed', 'stale');
  const target = host.active;
  if (proposal.kind === 'ask' && host.runtime.getCurrentRunController()) return { kind: 'local', output: 'Prompt acceptance waits until the current run is idle; the proposal remains unaccepted.' };
  if (proposal.kind === 'cancel') requireValue(target && proposal.target === target.acceptance.acceptanceId
    && host.runtime.getCurrentRunController() === target.controller, 'stale');
  let acceptance: Acceptance | undefined;
  const result = await approveOperation(host, 'accept remote ' + proposal.kind,
    `Principal: ${proposal.principal}\nRoom ${owner.roomId}; service epoch ${owner.epoch}; generation ${owner.owner.generation}\nProposal ${proposal.id}; exact digest ${proposal.digest}\n${proposal.kind === 'ask' ? 'Adopt this prompt through the ordinary runtime, budget and tool approval. Remote metadata grants no permission. Recheck ACL and consume it once immediately before dispatch.' : 'Request cancellation of the exact currently running acceptance ' + proposal.target + '; no later run is a target.'}\n${proposal.text ? promptPreview(proposal.text) : display(proposal.target)}`, async () => {
      requireValue(host.host === owner && (proposal.kind === 'ask' ? !host.runtime.getCurrentRunController()
        : host.active === target && host.runtime.getCurrentRunController() === target!.controller), 'stale');
      const claimed = object((await owner.request('claim', { proposalId })).result);
      requireValue(claimed.id === proposal.id && claimed.digest === proposal.digest && claimed.principal === proposal.principal
        && claimed.generation === owner.owner.generation && claimed.status === 'accepted' && claimed.acceptedBy === host.client!.profile.principal, 'stale');
      acceptance = { version: 1, ...currentBinding(host), origin: host.client!.profile.origin, epoch: owner.epoch, roomId: owner.roomId,
        principal: proposal.principal, generation: owner.owner.generation, proposalId, acceptanceId: uuid(claimed.acceptanceId),
        digest: proposal.digest, acceptedBy: host.client!.profile.principal };
      if (proposal.kind === 'ask') host.accepted.set(acceptance.acceptanceId, acceptance);
      else {
        await owner.request('dispatch', { acceptanceId: acceptance.acceptanceId, digest: acceptance.digest });
        requireValue(host.active === target && host.runtime.getCurrentRunController() === target!.controller, 'stale'); target!.controller.abort();
      }
      return { success: true, output: proposal.kind === 'ask' ? `Proposal ${proposalId} locally accepted; dispatch still requires current ACL.`
        : `Cancellation requested for ${proposal.target}; final exit/usage are separate.`, metadata: { status: proposal.kind === 'ask' ? 'accepted' : 'cancel-requested' } };
    });
  if (!result.ok || proposal.kind === 'cancel' || !acceptance) {
    if (acceptance && !result.ok) host.accepted.delete(acceptance.acceptanceId);
    return { kind: 'local', output: result.output };
  }
  return { kind: 'prompt', prompt: proposal.text!, promptMetadata: { collaboration: acceptance },
    notice: `Executing accepted proposal ${proposalId} from ${proposal.principal}; ordinary budget and tool approval apply.` };
}
