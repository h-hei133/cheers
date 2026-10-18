import type { CommandSyntax } from '../syntax/model.js';

export const advisorSyntax: CommandSyntax = { name: 'advisor', defaultAction: 'status', actions: [
  { name: 'status', summary: 'show independent checkpoint review status without sending' },
  { name: 'dump', summary: 'show bounded redacted checkpoints and advice without sending' },
  { name: 'configure', summary: 'configure an exact independent model, or use the session advisor role; remains off', parameters: [{ name: 'provider-or-connection/model', kind: 'text' }],
    flags: [{ name: 'every', kind: 'text', summary: 'review every N eligible boundaries (1..100)' },
      { name: 'timeout', kind: 'text', summary: 'bounded review timeout in milliseconds (100..60000)' },
      { name: 'mode', kind: 'text', values: ['turn', 'end'], summary: 'review each step boundary or only turn end' }] },
  { name: 'on', summary: 'explicitly enable review for the current session host' },
  { name: 'off', summary: 'disable review and fence pending results' },
  { name: 'review', summary: 'explicitly review the latest fresh captured checkpoint' },
  { name: 'apply', summary: 'submit an exact fresh note through ordinary prompt and permission gates', parameters: [{ name: 'note-id', kind: 'text', required: true }] },
] };
