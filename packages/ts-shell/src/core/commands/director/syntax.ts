import type { CommandSyntax } from '../syntax/model.js';
const id = { name: 'id', kind: 'text' as const, required: true };
const prompt = { name: 'prompt', kind: 'text' as const, required: true };
export const directorSyntax: CommandSyntax = { name: 'director', defaultAction: 'status', flags: [], actions: [
  { name: 'status', summary: 'inspect the preset and retained worker state' },
  { name: 'on', summary: 'enable a director with explicit persistent workers', flags: [
    { name: 'model', kind: 'text', summary: 'worker model on the current connection' },
    { name: 'effort', kind: 'text', values: ['auto', 'low', 'medium', 'high'], summary: 'worker reasoning effort' }] },
  { name: 'off', summary: 'revoke the preset and clean up its exact workers' },
  { name: 'spawn', summary: 'approve a persistent worker assignment', parameters: [prompt] },
  { name: 'send', summary: 'approve a fresh assignment at a settled worker checkpoint', parameters: [id, prompt] },
  { name: 'show', summary: 'inspect one worker', parameters: [id] },
  { name: 'output', summary: 'read worker text by byte offset', parameters: [id, { name: 'offset', kind: 'integer', minimum: 0, required: true }] },
  { name: 'wait', summary: 'wait for the exact worker run without creating a model request', parameters: [id,
    { name: 'seconds', kind: 'integer', minimum: 1, maximum: 30 }] },
  { name: 'stop', summary: 'approve cancellation of the exact worker', parameters: [id] },
] };
