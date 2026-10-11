import type { CommandSyntax } from '../syntax/model.js';

export const debugSyntax: CommandSyntax = {
  name: 'debug',
  defaultAction: 'summary',
  flags: [],
  actions: [
    { name: 'summary', summary: 'aggregate logs, crashes, timings, metrics and tools' },
  ],
};
