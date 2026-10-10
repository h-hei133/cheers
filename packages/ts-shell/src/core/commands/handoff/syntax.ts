import type { CommandSyntax } from '../syntax/model.js';
export const handoffSyntax: CommandSyntax = { name: 'handover', defaultAction: 'status', flags: [], actions: [
  { name: 'status', summary: 'inspect the current session model handoff and retained uncertainty' },
  { name: 'arm', summary: 'select an execution model for the next ordinary turn', parameters: [{ name: 'model', kind: 'text', required: true }],
    flags: [{ name: 'effort', kind: 'text', values: ['auto', 'low', 'medium', 'high'], summary: 'temporary execution reasoning effort' }] },
  { name: 'off', summary: 'cancel an idle pending selection without changing session models' },
] };
