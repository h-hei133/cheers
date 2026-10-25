import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';

export const researchAliases = ['research', 'deep'] as const;
export const researchSyntax: CommandSyntax = { name: 'deep-research', defaultAction: 'status', actions: [
  { name: '', summary: 'investigate a software, paper or mixed question with native evidence and independent review', parameters: [{ name: 'question', kind: 'text', rest: true, required: true }] },
  { name: 'status', summary: 'show current bound research state without sending' },
  { name: 'dump', summary: 'show the complete retained native research report without sending' },
  { name: 'pause', summary: 'pause admission and cancel the current local child' },
  { name: 'resume', summary: 'explicitly resume with the retained deadline and actual source reconciliation' },
  { name: 'steer', summary: 'revise the question while retaining earlier brief provenance and deadline', parameters: [{ name: 'question', kind: 'text', rest: true, required: true }] },
  { name: 'reconcile', summary: 'explicitly discard unknown output while retaining unknown request ledger/cap consequences', parameters: [{ name: 'decision', kind: 'text', required: true, values: ['discard'] }] },
], flags: [
  { name: 'mode', kind: 'text', values: ['software', 'paper', 'mixed'], summary: 'authoritative research domain' },
  { name: 'depth', kind: 'text', values: ['quick', 'deep'], summary: 'bounded quick or deep workload profile' },
  { name: 'brief', kind: 'text', summary: 'authorized local brief file to read before decomposition' },
  { name: 'save', short: 's', kind: 'boolean', summary: 'request a separate prepared and approved new report file' },
  { name: 'help', short: 'h', kind: 'boolean', summary: 'show usage' },
] };

export function parseResearchArgs(args: readonly string[]) {
  const first = args[0]?.toLowerCase();
  const control = researchSyntax.actions.some(action => action.name && action.name === first);
  return parseSyntax(researchSyntax, args.length && !control ? ['', ...args] : args);
}

/** Pure driver admission. Controls and save keep their independent command path. */
export function prepareResearch(args: readonly string[], prose: string): { args: readonly string[] } | { error: string } {
  const control = args[0]?.toLowerCase();
  if (researchSyntax.actions.some(action => action.name && action.name === control)) return { error: 'Research control actions cannot be composed.' };
  if (!prose.trim()) return { error: 'Research composition requires a shared question.' };
  const parsed = parseResearchArgs([...args, prose]);
  if (!parsed.ok) return { error: `Invalid research composition: ${parsed.reason}` };
  if (parsed.flags.has('save') || parsed.flags.has('help')) return { error: 'Research save/help must be used separately.' };
  return { args: [...args, prose] };
}
