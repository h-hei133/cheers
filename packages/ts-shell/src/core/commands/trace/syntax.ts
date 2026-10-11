import type { CommandSyntax } from '../syntax/model.js';

export const traceSyntax: CommandSyntax = {
  name: 'trace',
  defaultAction: 'open',
  flags: [],
  actions: [
    { name: 'open', summary: 'open the local trace dashboard' },
    { name: 'status', summary: 'show the active dashboard status' },
    { name: 'close', summary: 'close the local trace dashboard' },
  ],
};
