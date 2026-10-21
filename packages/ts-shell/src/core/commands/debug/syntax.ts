import type { CommandSyntax } from '../syntax/model.js';

export const debugSyntax: CommandSyntax = {
  name: 'debug',
  defaultAction: 'summary',
  flags: [],
  actions: [
    { name: 'summary', summary: 'aggregate logs, crashes, timings, metrics and tools' },
    { name: 'logs', summary: 'inspect recent structured log records' },
    { name: 'crashes', summary: 'inspect retained crash records' },
    { name: 'metrics', summary: 'inspect recorded counters and durations' },
    { name: 'timings', summary: 'inspect startup measurements' },
    { name: 'tools', summary: 'inspect the current tool catalog' },
  ],
};
