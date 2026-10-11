import type { CommandSyntax } from '../syntax/model.js';

export const skillfulSyntax: CommandSyntax = {
  name: 'skillful', defaultAction: 'status', flags: [], actions: [
    { name: 'on', aliases: ['enable'], summary: 'inject available skill instructions' },
    { name: 'off', aliases: ['disable'], summary: 'omit skill instructions from the prompt' },
    { name: 'toggle', summary: 'toggle skill instruction injection' },
    { name: 'status', summary: 'show skill injection status' },
  ],
};
