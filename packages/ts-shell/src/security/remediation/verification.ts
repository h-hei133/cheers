import type { Remediation, ScanRecord } from '../analysis/model.js';
import { digest } from '../analysis/source.js';
import path from 'node:path';
import type { OperationReceipt } from '../../edit/recovery/operation/model.js';

export function verifiesRemediation(original: ScanRecord, verification: ScanRecord, proposal: Remediation, receipt: OperationReceipt): boolean {
  return proposal.status === 'applied' && !proposal.durability && !verification.durability && !!proposal.operationId && digest(proposal.input) === proposal.digest
    && receipt.operationId === proposal.operationId && receipt.callId === proposal.id && receipt.status === 'committed' && receipt.undo === 'none'
    && receipt.files.length === Object.keys(proposal.expectedHashes).length && receipt.files.every(file => {
      const absolute = path.join(file.workspace.path, file.path);
      return file.status === 'committed' && file.before.state === 'exists' && file.after.state === 'exists'
        && file.before.hash === proposal.expectedHashes[absolute] && file.after.hash === proposal.afterHashes[absolute];
    })
    && original.id === proposal.scanId && verification.verificationOf === original.id && verification.origin === 'local'
    && verification.status === 'completed' && verification.coverage.status === 'complete'
    && verification.plan.root === original.plan.root && verification.plan.rootIdentity === original.plan.rootIdentity
    && verification.plan.rules.digest === original.plan.rules.digest && verification.plan.executable.digest === original.plan.executable.digest
    && verification.plan.version === original.plan.version
    && JSON.stringify(verification.plan.sources.map(item => item.path)) === JSON.stringify(original.plan.sources.map(item => item.path))
    && verification.plan.sources.every(source => source.digest === (proposal.afterHashes[source.path] ?? original.plan.sources.find(item => item.path === source.path)?.digest))
    && !verification.findings.some(finding => finding.fingerprint === proposal.fingerprint
      || original.findings.some(previous => previous.fingerprint === proposal.fingerprint && previous.rule === finding.rule && previous.path === finding.path));
}
