import type { CommandSyntax } from '../syntax/model.js';
const text = (name: string, required = true) => ({ name, kind: 'text' as const, required });
const integer = (name: string, minimum = 0) => ({ name, kind: 'integer' as const, required: true, minimum });
export const sshSyntax: CommandSyntax = { name: 'ssh', defaultAction: 'status', actions: [
  { name: 'status', summary: 'show selected remote profile and durable job state' },
  { name: 'profile', summary: 'select an explicit private SSH profile', parameters: [text('file')] },
  { name: 'connect', summary: 'verify the remote workspace and native capabilities', parameters: [] },
  { name: 'disconnect', summary: 'release the local remote binding without replaying jobs' },
  { name: 'run', summary: 'approve and submit one durable remote command', parameters: [text('command', true)] },
  { name: 'jobs', summary: 'list durable remote jobs' },
  { name: 'cancel-pending', summary: 'abort the local SSH request; remote jobs retain their own outcome' },
  { name: 'reconcile', summary: 'approve an explicit remote status observation', parameters: [text('job')] },
  { name: 'cancel', summary: 'approve cancellation of one exact remote invocation', parameters: [text('job')] },
  { name: 'output', summary: 'approve reading one bounded remote output page', parameters: [text('job'), text('stream'), integer('offset')] },
] };
