import type { ScanRecord } from '../analysis/model.js';

export function compareScans(baseline: ScanRecord, current: ScanRecord) {
  const comparable = baseline.plan.root === current.plan.root && baseline.plan.rootIdentity === current.plan.rootIdentity
    && baseline.plan.rules.digest === current.plan.rules.digest && baseline.plan.executable.digest === current.plan.executable.digest
    && baseline.plan.version === current.plan.version && JSON.stringify(baseline.plan.sources.map(item => item.path)) === JSON.stringify(current.plan.sources.map(item => item.path));
  const previous = new Set(baseline.findings.map(item => item.fingerprint)); const observed = new Set(current.findings.map(item => item.fingerprint));
  return { comparable, entries: [...new Set([...previous, ...observed])].sort().map(fingerprint => ({ fingerprint,
    state: !comparable ? 'unknown' : observed.has(fingerprint) ? previous.has(fingerprint) ? 'persistent' : 'new'
      : current.origin === 'local' && current.status === 'completed' && current.coverage.status === 'complete' ? 'absent' : 'unknown' })) };
}
