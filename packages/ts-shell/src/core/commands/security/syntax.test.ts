import { expect, it } from 'vitest';
import { parseSecurityArgs, securitySyntax } from './syntax.js';
import { securityCommandDefinition } from './registration.js';
import { syntaxHelp } from '../syntax/projection.js';

it('shares all eleven exact native actions across parsing, help and completion', () => {
  const actions = ['plan', 'scan', 'status', 'cancel', 'scans', 'show', 'import', 'export', 'validate', 'compare', 'disposition'];
  expect(securitySyntax.actions.map(action => action.name)).toEqual(actions);
  const command = securityCommandDefinition(); expect(command.getArgumentCompletions!('')!.map(item => item.value)).toEqual(actions);
  const examples = [['plan', '/analyzer', '1.30.2', 'rules.yml', 'source.ts'], ['scan', 'id'], ['status'], ['cancel'], ['scans'], ['show', 'id'],
    ['import', 'report.sarif', 'id'], ['export', 'id', 'report.sarif'], ['validate', 'id'], ['compare', 'before', 'after'], ['disposition', 'id', 'fingerprint', 'accepted-risk', 'Explicit reason']];
  for (const example of examples) { expect(parseSecurityArgs(example).ok).toBe(true); expect(syntaxHelp(securitySyntax)).toContain(`/security ${example[0]}`); }
  for (const example of [['constructor'], ['__proto__'], ['status', 'id', 'extra'], ['scans', 'extra'], ['disposition', 'id', 'fingerprint', 'fixed', 'fake evidence'], ['disposition', 'id', 'fingerprint', 'apply', 'one', 'two']]) expect(parseSecurityArgs(example).ok).toBe(false);
});
