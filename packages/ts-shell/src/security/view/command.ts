import { parseSecurityArgs, securitySyntax } from '../../core/commands/security/syntax.js';
import { syntaxHelp } from '../../core/commands/syntax/projection.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import { readSecurityInput } from '../analysis/read.js';
import { securityReport } from './report.js';
import type { SecurityService } from '../service.js';

export async function runSecurityCommand(args: readonly string[], service: SecurityService): Promise<LocalCommandResult> {
  const parsed = parseSecurityArgs(args);
  if (!parsed.ok) return securityReport('Security usage', [`Security: ${parsed.reason}`, syntaxHelp(securitySyntax)]);
  const values = parsed.args;
  try {
    switch (parsed.action.name) {
      case 'plan': return service.plan(values[0]!, values[1]!, values[2]!, values.slice(3));
      case 'scan': return await service.scan(values[0]!);
      case 'status': return service.status(values[0]);
      case 'cancel': return service.cancel(values[0]);
      case 'scans': return service.scans();
      case 'show': return service.show(values[0]!, values[1]);
      case 'import': return await service.importReport(values[0]!, values[1]!);
      case 'export': return await service.exportReport(values[0]!, values[1]!);
      case 'compare': return service.compare(values[0]!, values[1]!);
      case 'validate': return await service.validate(values[0]!, values[1]);
      case 'disposition': {
        if (values[2] === 'propose') { service.assertIdle(); return service.propose(values[0]!, values[1]!, await readSecurityInput(service.host.root(), values[3]!, service.host.sourceAccess, service.host.execution)); }
        if (values[2] === 'apply') return await service.apply(values[0]!, values[1]!, values[3]!);
        return service.disposition(values[0]!, values[1]!, values[2] as 'open' | 'false-positive' | 'accepted-risk', values.slice(3).join(' '));
      }
      default: return securityReport('Security usage', [syntaxHelp(securitySyntax)]);
    }
  } catch (error) {
    return securityReport('Security refusal', [error instanceof Error && /^Security|^Finding|^Select|^A |^Only |^Another |^An |^Complete |^Verification|^Imported/.test(error.message)
      ? error.message : 'Security operation failed or its publication is unverified.'], { status: 'unverified' });
  }
}
