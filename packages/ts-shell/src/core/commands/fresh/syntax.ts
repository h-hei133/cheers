import type { CommandSyntax } from '../syntax/model.js';

export const freshSyntax: CommandSyntax = {
  name: 'fresh',
  defaultAction: '',
  actions: [{ name: '', summary: 'reset controllable local state only' }],
};
