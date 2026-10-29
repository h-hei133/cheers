import type { CommandSyntax } from '../syntax/model.js';

export const undoSyntax: CommandSyntax = {
  name: 'undo', defaultAction: 'preview',
  actions: [
    { name: 'preview', summary: 'preview the latest recorded file operation without writing' },
    { name: 'status', summary: 'read this session’s saved operation results', parameters: [{ name: 'operation-id', kind: 'text' }],
      flags: [
        { name: 'cursor', kind: 'text', summary: 'continue an unchanged saved-results page', conflictsWithArguments: true },
        { name: 'turn', kind: 'text', summary: 'list the operations one turn recorded', conflictsWithArguments: true },
      ] },
    { name: 'execute', summary: 'restore the exact approved operation preview', parameters: [
      { name: 'operation-id', kind: 'text', required: true }, { name: 'preview-revision', kind: 'text', required: true },
    ], flags: [{ name: 'execute', kind: 'boolean', summary: 'explicitly confirm the selected restoration', suggest: false }] },
    { name: 'restore-turn', summary: 'restore every outstanding operation one turn recorded, newest first',
      parameters: [{ name: 'turn-id', kind: 'text', required: true }],
      flags: [{ name: 'execute', kind: 'boolean', summary: 'explicitly confirm the restoration', suggest: false }] },
    { name: 'help', aliases: ['--help'], summary: 'show undo usage' },
  ],
  flags: [],
};
