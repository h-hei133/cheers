import type { CommandSyntax } from '../syntax/model.js';
const id = { name: 'id', kind: 'text' as const, required: true };
export const jobsSyntax: CommandSyntax = { name: 'jobs', defaultAction: 'list', actions: [
  { name: 'list', summary: 'list the current session jobs and retained uncertainty' },
  { name: 'run', summary: 'approve and start an exact local shell command', parameters: [{ name: 'command', kind: 'text', required: true }] },
  { name: 'queue', summary: 'approve and retain one undispatched local shell command', parameters: [{ name: 'command', kind: 'text', required: true }] },
  { name: 'show', summary: 'inspect one job, parent and native state', parameters: [id] },
  { name: 'cancel', summary: 'approve cancellation through the exact live owner', parameters: [id] },
  { name: 'pause', summary: 'pause queued undispatched work only', parameters: [id] },
  { name: 'resume', summary: 'approve dispatch of retained undispatched work', parameters: [id] },
  { name: 'output', summary: 'read a bounded local output page', parameters: [id, { name: 'stream', kind: 'text', required: true },
    { name: 'offset', kind: 'integer', required: true, minimum: 0 }] },
] };
