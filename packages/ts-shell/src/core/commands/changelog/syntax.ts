import type { CommandSyntax } from '../syntax/model.js';

export const changelogSyntax: CommandSyntax = {
  name: 'changelog',
  defaultAction: 'last',
  flags: [],
  actions: [
    { name: 'last', summary: 'show the latest installed release entry' },
    { name: 'full', summary: 'show all installed release entries' },
  ],
};
