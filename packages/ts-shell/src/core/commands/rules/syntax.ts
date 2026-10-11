import type { CommandSyntax } from '../syntax/model.js';

export const rulesSyntax: CommandSyntax = {
  name: 'rules',
  defaultAction: 'propose',
  actions: [
    { name: 'propose', aliases: ['feedback'], summary: 'preview a rule refinement from explicit feedback', parameters: [{ name: 'feedback', kind: 'text', required: true, rest: true }], flags: [] },
    { name: 'apply', summary: 'approve the exact retained rule proposal', parameters: [{ name: 'proposal-id', kind: 'text', required: true }], flags: [] },
  ],
};

export const initSyntax: CommandSyntax = {
  name: 'init', defaultAction: 'preview', actions: [
    { name: 'preview', summary: 'inspect bounded authorized project metadata', flags: [] },
    { name: 'apply', summary: 'approve the exact retained initialization proposal', parameters: [{ name: 'proposal-id', kind: 'text', required: true }], flags: [] },
  ],
};
