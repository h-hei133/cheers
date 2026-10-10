import type { CommandSyntax } from '../syntax/model.js';
const word = (name: string, required = true) => ({ name, kind: 'text' as const, required });
export const collabSyntax: CommandSyntax = { name: 'collab', defaultAction: 'status', actions: [
  { name: 'status', summary: 'inspect the local connection and host lease' },
  { name: 'profile', summary: 'select a private explicit service profile', parameters: [word('file')] },
  { name: 'test', summary: 'check service identity and version without creating a room' },
  { name: 'start', summary: 'approve a scrubbed session snapshot and principal ACL', parameters: [word('acl-json')] },
  { name: 'resume', summary: 'explicitly acquire an expired host lease for this exact session', parameters: [word('room')] },
  { name: 'stop', summary: 'close and fence the hosted room' },
  { name: 'join', summary: 'observe an authenticated remote room', parameters: [word('room')] },
  { name: 'leave', summary: 'release the guest connection' },
  { name: 'events', summary: 'read a bounded page using the persisted guest cursor' },
  { name: 'grant', summary: 'approve exact principal observe, ask or control rights', parameters: [word('principal'), word('rights')] },
  { name: 'revoke', summary: 'revoke one principal and fence its pending work', parameters: [word('principal')] },
  { name: 'ask', summary: 'propose a prompt without executing it', parameters: [word('text')] },
  { name: 'cancel', summary: 'propose cancellation of one remote acceptance', parameters: [word('acceptance')] },
  { name: 'proposals', summary: 'inspect the host proposal status metadata' },
  { name: 'inspect', summary: 'read one complete host proposal', parameters: [word('proposal')] },
  { name: 'accept', summary: 'locally approve one proposal for the ordinary prompt path', parameters: [word('proposal')] },
  { name: 'receipt', summary: 'query a mutation without repeating it', parameters: [word('request')] },
] };
export const shareSyntax: CommandSyntax = { name: 'share', defaultAction: 'preview', actions: [
  { name: 'preview', summary: 'scrub a bounded session snapshot without network' },
  { name: 'publish', summary: 'approve a read-only share on the selected origin', parameters: [word('principals'),
    { name: 'ttl-seconds', kind: 'integer', required: true, minimum: 60, maximum: 86400 }] },
  { name: 'read', summary: 'read one share with an authenticated principal', parameters: [word('share')] },
  { name: 'revoke', summary: 'remove authenticated access to a share', parameters: [word('share')] },
  { name: 'delete', summary: 'delete stored share content and revoke access', parameters: [word('share')] },
] };
export const dumpSyntax: CommandSyntax = { name: 'dump', defaultAction: 'preview', actions: [
  { name: 'preview', summary: 'inspect a scrubbed bounded session projection' },
  { name: 'copy', summary: 'approve copying scrubbed session text to the clipboard' },
  { name: 'save', summary: 'approve exact local destination and snapshot bytes', parameters: [word('file')],
    flags: [{ name: 'raw', kind: 'boolean', summary: 'explicitly save raw local transcript bytes, including secrets' }] },
] };
