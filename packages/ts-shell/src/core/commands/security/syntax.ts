import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';

const text = (name: string, required = true) => ({ name, kind: 'text' as const, required });
export const securitySyntax: CommandSyntax = { name: 'security', defaultAction: 'status', actions: [
  { name: 'plan', summary: 'freeze local analyzer, exact version, local rules and explicit source files without execution', parameters: [text('executable'), text('version'), text('rules'), { ...text('files'), rest: true }] },
  { name: 'scan', summary: 'separately approve and execute an exact frozen plan', parameters: [text('plan-id')] },
  { name: 'status', summary: 'show native state and coverage; restarted work is unknown', parameters: [text('scan-id', false)] },
  { name: 'cancel', summary: 'request cancellation of the live local scan', parameters: [text('scan-id', false)] },
  { name: 'scans', summary: 'list retained scans and analyzer coverage' },
  { name: 'show', summary: 'show severity/path/rule sorted findings and retained evidence', parameters: [text('scan-id'), text('fingerprint', false)] },
  { name: 'import', summary: 'read bounded SARIF as imported evidence without local verification claims', parameters: [text('sarif-path'), text('plan-id')] },
  { name: 'export', summary: 'separately approve a complete redacted report through the existing patch writer', parameters: [text('scan-id'), text('path')] },
  { name: 'validate', summary: 'approve same-rule/scope/version reanalysis; fixed requires a committed targeted patch receipt', parameters: [text('scan-id'), text('fingerprint', false)] },
  { name: 'compare', summary: 'compare stable findings as new, persistent, absent or unknown', parameters: [text('baseline-id'), text('current-id')] },
  { name: 'disposition', summary: 'preserve evidence with reasoned disposition, or propose/apply a finding-targeted patch', parameters: [text('scan-id'), text('fingerprint'),
    { ...text('decision'), values: ['open', 'false-positive', 'accepted-risk', 'propose', 'apply'] }, { ...text('reason-or-patch-path-or-proposal-id'), rest: true }] },
] };
export function parseSecurityArgs(args: readonly string[]) {
  const parsed = parseSyntax(securitySyntax, args);
  if (parsed.ok && parsed.action.name === 'disposition' && ['propose', 'apply'].includes(parsed.args[2]!) && parsed.args.length !== 4) return { ok: false as const, reason: 'Expected exactly one patch path or proposal ID.' };
  return parsed;
}
