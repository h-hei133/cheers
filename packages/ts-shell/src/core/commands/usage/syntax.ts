import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';
export const usageSyntax: CommandSyntax = { name: 'usage', defaultAction: 'show', actions: [
  { name: 'show', aliases: ['status'], summary: 'show measured session activity and account availability' },
  { name: 'account', summary: 'read quota and offers for the current selected account' },
  { name: 'reset', summary: 'preview one current account credit; apply requires the exact preview ID',
    parameters: [{ name: 'action', kind: 'text', values: ['apply'] }, { name: 'preview-id', kind: 'text' }] },
] };
export function parseUsageArgs(args: readonly string[]) {
  const result = parseSyntax(usageSyntax, args);
  if (result.ok && result.action.name === 'reset' && result.args.length === 1) return { ok: false as const, reason: 'Reset apply requires its preview ID.' };
  return result;
}
