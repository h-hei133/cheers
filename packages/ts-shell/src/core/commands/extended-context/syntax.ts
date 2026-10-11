import type { CommandSyntax } from '../syntax/model.js';

export const extendedContextSyntax: CommandSyntax = {
  name: 'extended-context', defaultAction: 'status', flags: [], actions: [
    { name: 'on', aliases: ['enable'], summary: 'use the catalog-supported model window' },
    { name: 'off', aliases: ['disable'], summary: 'use the normal context policy' },
    { name: 'status', summary: 'show the selected context window' },
  ],
};
