import fs from 'node:fs'
import path from 'node:path'

const repoAuditResiduePattern = /\.sisyphus[\/\\]audit[\/\\]permissions\.jsonl/

export function createIsolatedAuditLogPath({
  runId,
  getAuditLogPath,
  assertSafeRuntimeHome,
} = {}) {
  const auditLogPath = getAuditLogPath(runId)
  assertSafeRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  return auditLogPath
}

export function cleanupIsolatedAuditLogPath(auditLogPath, { assertSafeRuntimeHome } = {}) {
  if (!auditLogPath) return
  assertSafeRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
}

export function hasRepoAuditResidue(status) {
  return Boolean(status && repoAuditResiduePattern.test(status))
}

export function inspectAuditIsolation({
  auditLogPath,
  repoAfter,
  auditResidueCleaned = false,
  isPathInsideTestRoot,
} = {}) {
  return {
    auditLogKind: auditLogPath && isPathInsideTestRoot(auditLogPath)
      ? 'isolated-test-root'
      : auditLogPath
        ? 'non-isolated'
        : 'not-configured',
    repoAuditResidueDetected: hasRepoAuditResidue(repoAfter?.status),
    auditResidueCleaned: Boolean(auditResidueCleaned),
    auditLogCreated: Boolean(auditLogPath && fs.existsSync(auditLogPath)),
  }
}
