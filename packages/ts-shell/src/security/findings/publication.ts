import type { ScanRecord, Remediation } from '../analysis/model.js';
import type { SecurityStore } from './store.js';
import { retainScan, retainRemediation } from './store.js';

/** A failed save after execution cannot erase an observed effect or its receipt. */
export class SecurityPublication {
  readonly scans = new Map<string, ScanRecord>();
  readonly remediations = new Map<string, Remediation>();
  private readonly listeners = new Set<() => void>();
  private revisionValue = 0n;
  constructor(readonly store: SecurityStore) {}
  get revision(): string { return String(this.revisionValue); }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  notify(): void {
    this.revisionValue++;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* an inspector cannot break publication */ }
    }
  }
  scan(record: ScanRecord): ScanRecord {
    this.scans.set(record.id, record);
    try { retainScan(this.store, record); this.notify(); return record; }
    catch {
      if (!record.receipts.length) throw new Error('Security scan state could not be saved before native dispatch.');
      const unknown = { ...record, durability: 'unknown' as const, note: `${record.note} Session persistence is unknown; retained native receipts remain visible in this process.` };
      this.scans.set(record.id, unknown); this.notify(); return unknown;
    }
  }
  remediation(record: Remediation): Remediation {
    this.remediations.set(record.id, record);
    try { retainRemediation(this.store, record); this.notify(); return record; }
    catch {
      if (!record.operationId) throw new Error('Security remediation state could not be saved before patch dispatch.');
      const unknown = { ...record, durability: 'unknown' as const }; this.remediations.set(record.id, unknown); this.notify(); return unknown;
    }
  }
}
