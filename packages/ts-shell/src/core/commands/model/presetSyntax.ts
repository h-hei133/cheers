import type { CommandSyntax } from '../syntax/model.js';

/** Syntax for the session-owned model preset command. */
export const modelPresetSyntax: CommandSyntax = {
  name: 'modelpreset',
  defaultAction: 'status',
  flags: [
    { name: 'profile', kind: 'boolean', summary: 'save into the profile library instead of this session' },
  ],
  actions: [
    { name: 'status', aliases: ['list'], summary: 'show saved session model presets' },
    {
      name: 'save',
      summary: 'save the current model or explicit role targets as a preset',
      parameters: [
        { name: 'name', kind: 'text', required: true },
        { name: 'role=provider/model[@effort]', kind: 'text', rest: true },
      ],
    },
    {
      name: 'apply',
      aliases: ['use'],
      summary: 'apply one role from a saved preset',
      parameters: [
        { name: 'name', kind: 'text', required: true },
        { name: 'role', kind: 'text' },
      ],
    },
    {
      name: 'promote',
      summary: 'copy a session preset into the profile library',
      parameters: [{ name: 'name', kind: 'text', required: true }],
    },
    {
      name: 'delete',
      summary: 'delete a name from the profile library',
      parameters: [{ name: 'name', kind: 'text', required: true }],
    },
    {
      name: 'validate',
      summary: 'validate a saved preset against the model catalogue',
      parameters: [{ name: 'name', kind: 'text', required: true }],
    },
  ],
};
