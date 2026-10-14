import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';
export const usageSyntax: CommandSyntax = { name: 'usage', defaultAction: 'show', actions: [
  { name: 'show', aliases: ['status'], summary: 'show measured session activity and account availability' },
  { name: 'account', summary: 'read quota and offers for the current selected account' },
  { name: 'reset', summary: 'preview a credit; apply requires its ID; status [request-id] inspects local receipts',
    parameters: [{ name: 'action', kind: 'text', values: ['apply', 'status'] }, { name: 'request-id', kind: 'text' }] },
] };
export function parseUsageArgs(args: readonly string[]) {
  const result = parseSyntax(usageSyntax, args);
  if (result.ok && result.action.name === 'reset') {
    if (result.args[0] === 'apply' && result.args.length === 1) return { ok: false as const, reason: 'Reset apply requires its preview ID.' };
    if (result.args[0] === 'status' && result.args[1] !== undefined
      && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.args[1])) return { ok: false as const, reason: 'Reset status requires a UUID request ID.' };
  }
  return result;
}
