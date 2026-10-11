import type { CommandSyntax } from '../syntax/model.js';

export const slowSyntax: CommandSyntax = {
  name: 'slow', defaultAction: '', flags: [], actions: [
    { name: '', summary: 'inspect provider flex tier' },
    { name: 'on', aliases: ['enable'], summary: 'use the provider flex service tier' },
    { name: 'off', aliases: ['disable'], summary: 'restore the standard provider tier' },
    { name: 'status', summary: 'show slow service-tier status' },
  ],
};
