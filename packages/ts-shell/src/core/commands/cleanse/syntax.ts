import type { CommandSyntax } from '../syntax/model.js';

export const cleanseSyntax: CommandSyntax = {
  name: 'cleanse', defaultAction: 'diagnose',
  actions: [
    { name: 'diagnose', aliases: ['status'], summary: 'inspect retained native findings', parameters: [{ name: 'scan-id', kind: 'text' }], flags: [] },
    { name: 'repair', summary: 'prepare an exact patch for a retained finding', parameters: ['scan-id', 'fingerprint', 'patch-path'].map(name => ({ name, kind: 'text' as const, required: true })), flags: [] },
    { name: 'apply', summary: 'request ordinary approval for that exact retained repair', parameters: ['scan-id', 'fingerprint', 'proposal-id'].map(name => ({ name, kind: 'text' as const, required: true })), flags: [] },
    { name: 'verify', summary: 're-run the original native scope/rules/version after repair', parameters: [{ name: 'scan-id', kind: 'text', required: true }, { name: 'fingerprint', kind: 'text' }], flags: [] },
  ],
};
