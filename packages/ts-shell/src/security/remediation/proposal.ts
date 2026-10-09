import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { planPatch } from '../../edit/patch/plan.js';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import type { ToolDefinition, ToolExecutionContext } from '../../tools/types.js';
import { digest, exactFile, snapshotFile } from '../analysis/source.js';
import type { Finding, Remediation, ScanRecord } from '../analysis/model.js';

export function prepareRemediation(scan: ScanRecord, finding: Finding, input: string, context: ToolExecutionContext): Remediation {
  if (scan.origin !== 'local' || !['completed', 'partial'].includes(scan.status)) throw new Error('A local native finding is required for remediation.');
  const absolute = exactFile(scan.plan.root, finding.path); context.assertSourceAccess?.(absolute);
  const source = snapshotFile(absolute, 512 * 1024).snapshot;
  if (source.digest !== finding.sourceDigest) throw new Error('Finding source changed; scan again before proposing a patch.');
  const plan = planPatch(input, { ...context, sessionId: context.sessionId!, workspaceRoot: scan.plan.root });
  if (!plan.files.length || plan.files.some(file => path.join(file.workspaceRoot, file.relativePath) !== finding.path || file.content === undefined || file.before.state !== 'exists' || file.rename)) throw new Error('Security remediation may only update the exact selected finding file.');
  const expectedHashes = { [finding.path]: source.digest }; const afterHashes = { [finding.path]: digest(plan.files[0]!.content!) };
  const preparation = createPatchToolDefinition().prepare!({ input, expectedHashes }, context);
  return { id: randomUUID(), scanId: scan.id, fingerprint: finding.fingerprint, input, digest: digest(input), expectedHashes, afterHashes,
    preview: preparation.preview, status: 'proposed' };
}
export function remediationTool(proposal: Remediation, publish: (proposal: Remediation) => Remediation): ToolDefinition {
  const patch = createPatchToolDefinition();
  return { ...patch, onRefusal: (_args, _context, outcome) => publish({ ...proposal, status: outcome === 'denied' ? 'denied' : 'blocked' }),
    prepare: (args, context) => {
      if (args.input !== proposal.input || digest(proposal.input) !== proposal.digest || JSON.stringify(args.expectedHashes) !== JSON.stringify(proposal.expectedHashes)) throw new Error('Security patch proposal changed.');
      const prepared = patch.prepare!.call(patch, args, context);
      if (prepared.targets.length !== Object.keys(proposal.expectedHashes).length || prepared.targets.some(target => target.operation !== 'write' || !Object.hasOwn(proposal.expectedHashes, target.path))) throw new Error('Security patch targets exceed finding authorization.');
      return { ...prepared, execute: async actual => {
        const result = await prepared.execute(actual); const receipt = result.metadata;
        const status = receipt?.status === 'committed' && typeof receipt.operationId === 'string' ? 'applied'
          : receipt?.status === 'partial' ? 'partial' : receipt?.status === 'unknown' ? 'unknown' : 'blocked';
        const next = { ...proposal, status: status as Remediation['status'], ...(typeof receipt?.operationId === 'string' ? { operationId: receipt.operationId } : {}) };
        const observed = publish(next);
        return { ...result, success: result.success && !observed.durability, metadata: { ...result.metadata, durability: observed.durability ?? 'persisted' },
          output: `${result.output ?? result.error ?? 'Patch outcome unavailable'}\nSecurity remediation ${status}; native verification is still required.${observed.durability ? ' Session persistence is unknown; actual patch receipt remains visible.' : ''}` };
      } };
    } };
}
