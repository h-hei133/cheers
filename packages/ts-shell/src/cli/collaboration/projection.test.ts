import { expect, it } from 'vitest';
import { aclPreview, promptPreview } from './projection.js';
import { decodeAcl } from '../../collaboration/contract/acl.js';

it('shows every authorized recipient and right without a long approval line', () => {
  const principals = Array.from({ length: 32 }, (_, index) => `guest${String(index).padStart(2, '0')}${'x'.repeat(121)}`);
  const acl = decodeAcl(Object.fromEntries(principals.map(principal => [principal, ['observe', 'ask', 'control']])));
  const preview = aclPreview(acl); const rows = preview.split('\n');
  expect(rows).toHaveLength(32);
  for (const principal of principals) expect(rows).toContain(`- ${principal}: observe, ask, control`);
  expect(rows.every(row => row.length < 160)).toBe(true);
  expect(preview).not.toContain('shortened');
  const named = decodeAcl({ 'token:operations': ['observe'], 'password:team': ['observe'], 'sk-SYNTHETIC12345678': ['observe'] });
  for (const principal of Object.keys(named)) expect(aclPreview(named)).toContain(`- ${principal}: observe`);
});
it('shows a complete bounded prompt including its tail in short safe approval rows', () => {
  const prompt = 'x'.repeat(15_000) + '\nTAIL_UNTRUSTED_PROMPT\u001b[2J Bearer SYNTHETIC_PROMPT_SECRET';
  const preview = promptPreview(prompt);
  expect(preview).toContain('TAIL_UNTRUSTED_PROMPT'); expect(preview).toContain('\\x1b[2J');
  expect(preview).not.toContain('SYNTHETIC_PROMPT_SECRET'); expect(preview).not.toContain('shortened');
  expect(preview.split('\n').every(row => row.startsWith('│ ') && [...row].length <= 514)).toBe(true);
  expect((preview.match(/x/g) ?? []).length).toBeGreaterThanOrEqual(15_000);
});
