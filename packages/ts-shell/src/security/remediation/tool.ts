import type { ToolDefinition } from '../../tools/types.js';
import type { SecurityService } from '../service.js';

/** Advisory proposals travel in the ordinary model tool loop and request ledger. */
export function securityProposalTool(service: SecurityService): ToolDefinition {
  return { name: 'security_propose', description: 'Prepare an advisory exact patch for one retained native security finding. Does not apply it. The user separately approves apply_patch, then a native same-rule/scope/version validation is required.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['scanId', 'fingerprint', 'input'], properties: {
      scanId: { type: 'string', maxLength: 64 }, fingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' }, input: { type: 'string', maxLength: 512 * 1024 } } },
    async execute(args, context) {
      try {
        if (!context.sessionId || context.sessionId !== service.host.gate().sessionId || context.workspaceRoot !== service.host.root()) throw new Error('binding');
        const report = service.propose(String(args.scanId), String(args.fingerprint), String(args.input), true); return { success: true, output: report.output, metadata: { proposal: report.report?.facts } }; }
      catch { return { success: false, error: 'Security proposal refused: finding, source snapshot, target authorization or patch plan did not match.' }; }
    } };
}
