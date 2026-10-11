import type { CommandSyntax } from '../syntax/model.js';

export const forceSyntax: CommandSyntax = {
  name: 'force',
  actions: [{ name: '', summary: 'select one available tool for the next request', parameters: [{ name: 'tool', kind: 'text', required: true }] }],
};
