import type { CommandSyntax, CommandFlag } from '../syntax/model.js';

const confirmation: CommandFlag = { name: 'confirm', kind: 'text', summary: 'confirm the exact preview digest', suggest: false };
const target: CommandFlag = { name: 'target', kind: 'text', summary: 'select the stored target profile' };
export const profileSyntax: CommandSyntax = {
  name: 'profile', defaultAction: 'status', actions: [
    { name: 'status', summary: 'show the immutable active profile' },
    { name: 'list', summary: 'list stored profiles' },
    { name: 'create', summary: 'create an empty isolated profile', parameters: [{ name: 'name', kind: 'text', required: true }] },
    { name: 'import', summary: 'preview or explicitly apply a source-preserving import', parameters: [{ name: 'source', kind: 'text', required: true }],
      flags: [target, confirmation, ...['config', 'catalog', 'definitions', 'history'].map(name => ({ name, kind: 'boolean' as const, summary: `select ${name}` }))] },
    { name: 'recover', summary: 'inspect or explicitly resume an import; inspect switch outcomes', parameters: [{ name: 'operation', kind: 'text', required: true }], flags: [target, confirmation] },
    { name: 'switch', summary: 'preview or request a drained fresh process', parameters: [{ name: 'name', kind: 'text', required: true }], flags: [confirmation] },
  ],
};
