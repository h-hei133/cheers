import type { CommandContext, CommandExecutionResult } from '../../core/commands/types.js';
import { collabSyntax, dumpSyntax, shareSyntax } from '../../core/commands/collaboration/syntax.js';
import { parseSyntax } from '../../core/commands/syntax/parse.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js';
import { readProfile } from '../../collaboration/client/profile.js';
import { CollaborationClient, UnknownMutation } from '../../collaboration/client/service.js';
import { requireValue, uuid } from '../../collaboration/contract/value.js';
import type { CollaborationComposition } from './model.js';
import { approveOperation } from './approval.js';
import { display } from './projection.js';
import { changeRights, joinRoom, proposeRemote, startHost, stopHost } from './host.js';
import { acceptRemoteProposal, inspectRemoteProposal } from './proposals.js';
import { runDump, runShare } from './export.js';

export async function runCollaborationCommand(host: CollaborationComposition, name: 'collab' | 'share' | 'dump', args: string[], command: CommandContext): Promise<CommandExecutionResult> {
  const syntax = name === 'collab' ? collabSyntax : name === 'share' ? shareSyntax : dumpSyntax;
  const parsed = parseSyntax(syntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /${name} arguments: ${parsed.reason}\n${syntaxHelp(syntax)}` };
  try {
    const action = parsed.action.name;
    if (name === 'share') return { kind: 'local', output: await runShare(host, action, parsed.args) };
    if (name === 'dump') return { kind: 'local', output: await runDump(host, action, parsed.args, parsed.flags.has('raw'), command) };
    if (action === 'accept') return await acceptRemoteProposal(host, parsed.args[0]!);
    return { kind: 'local', output: await runControl(host, action, parsed.args) };
  } catch (error) {
    return { kind: 'local', output: error instanceof UnknownMutation ? `Mutation outcome unknown; request ${error.requestId}. Query /collab receipt ${error.requestId}; no automatic retry.`
      : `Collaboration refused or unavailable. ${display(error instanceof Error ? error.message : 'No effect was confirmed.')} No operation was automatically retried.` };
  }
}
async function runControl(host: CollaborationComposition, action: string, args: readonly string[]): Promise<string> {
  if (action === 'status') return display({ profile: host.client ? { origin: host.client.profile.origin, principal: host.client.profile.principal, protocol: 1 } : 'not-selected',
    host: host.host ? { roomId: host.host.roomId, epoch: host.host.epoch, generation: host.host.owner.generation, status: host.host.status() } : 'not-hosting',
    guest: host.guest ? { roomId: host.guest.roomId, epoch: host.guest.epoch, status: host.guest.status() } : 'not-joined', activeAcceptance: host.active?.acceptance.acceptanceId });
  if (action === 'profile') return selectProfile(host, args[0]!);
  if (action === 'events') { requireValue(host.guest, 'unavailable'); return display(host.guest.view()); }
  if (action === 'leave') { host.guest?.close(); host.guest = undefined; return 'Guest connection released; local transcript and workspace unchanged.'; }
  if (action === 'proposals') return display(host.proposals);
  if (action === 'inspect') return display(await inspectRemoteProposal(host, args[0]!));
  requireValue(host.client, 'unavailable'); host.client.profile.check();
  if (action === 'test') { const response = await host.client.request('hello', { data: {} }); return `Service identity/version: ${display(response.result)}; no room/share/model/tool created.`; }
  if (action === 'receipt') return display((await host.client.request('receipt', { data: { requestId: uuid(args[0]) } })).result);
  if (action === 'start') return startHost(host, args[0]);
  if (action === 'resume') return startHost(host, undefined, args[0]);
  if (action === 'stop') return stopHost(host);
  if (action === 'join') return joinRoom(host, args[0]!);
  if (action === 'grant' || action === 'revoke') return changeRights(host, args[0]!, action === 'grant' ? args[1] : undefined);
  if (action === 'ask' || action === 'cancel') return proposeRemote(host, action, args[0]!);
  requireValue(false);
}
async function selectProfile(host: CollaborationComposition, target: string): Promise<string> {
  requireValue(!host.host || host.host.status() !== 'hosting', 'busy'); requireValue(!host.active, 'busy');
  const options = host.gate();
  const profile = readProfile(target, absolute => { const decision = evaluateToolPermissionScope('read', { path: absolute }, options.permissionScope, options.workspaceRoot, options.denyRules);
    requireValue(!decision.denied, 'denied'); });
  const result = await approveOperation(host, 'select profile', `Select explicit collaboration origin ${profile.origin}, principal ${profile.principal}.\nReviewed DNS addresses: ${profile.addresses.join(', ')}. TLS verification remains enabled; HTTP is literal loopback only.\nThe bearer comes from the private token-file reference and is never printed. This selection makes no network request.`, async () => {
    profile.check(); host.guest?.close(); host.client?.close(); host.client = new CollaborationClient(profile); host.guest = undefined;
    return { success: true, output: `Selected ${profile.origin} as ${profile.principal}; connection not tested.`, metadata: { status: 'selected' } };
  }); return result.output;
}
