import type { CommandSyntax } from '../syntax/model.js';
export const improveSyntax: CommandSyntax = { name: 'improve', defaultAction: 'status', flags: [], actions: [
  { name: 'status', summary: 'inspect fixed evaluations and truthful retained outcomes' },
  { name: 'start', summary: 'approve an isolated candidate and its frozen baseline', parameters: [{ name: 'manifest', kind: 'text', required: true }] },
  { name: 'check', summary: 'approve scoring the current candidate against fixed train and holdout samples' },
  { name: 'patch', summary: 'approve an exact isolated candidate patch', parameters: [{ name: 'patch-file', kind: 'text', required: true }] },
  { name: 'publish', summary: 'reevaluate, then separately approve publishing exact candidate files' },
  { name: 'stop', summary: 'revoke evaluation authority and retain artifacts and source files' },
] };
