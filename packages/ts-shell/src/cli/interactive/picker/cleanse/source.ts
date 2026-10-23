import type { SecurityInspectionSnapshot } from '../../../../security/view/inspection.js';

/** Retained diagnostic rows are admitted before option/search strings are joined. */
export const CLEANSE_SOURCE_LIMITS = Object.freeze({ items: 96, textUnits: 8 * 1024 * 1024, detailLines: 4096 });

export function admitCleanseSource(snapshot: SecurityInspectionSnapshot, check: () => void): void {
  if (snapshot.items.length > CLEANSE_SOURCE_LIMITS.items) throw new Error('Retained diagnostics exceed browsing limits.');
  let units = snapshot.identity.sessionId.length + snapshot.identity.workspaceRoot.length + snapshot.version.length;
  let lines = 0;
  if (units > CLEANSE_SOURCE_LIMITS.textUnits) throw new Error('Retained diagnostics exceed browsing limits.');
  for (const item of snapshot.items) {
    check();
    for (const value of [item.identity, item.kind, item.id, item.targetId, item.status, item.durability, item.owner, item.summary]) {
      units += value.length;
      if (units > CLEANSE_SOURCE_LIMITS.textUnits) throw new Error('Retained diagnostics exceed browsing limits.');
    }
    for (const line of item.detail) {
      check(); units += line.length;
      if (++lines > CLEANSE_SOURCE_LIMITS.detailLines || units > CLEANSE_SOURCE_LIMITS.textUnits) throw new Error('Retained diagnostics exceed browsing limits.');
    }
  }
}

/** Own the admitted projection; mutable inspector objects cannot change an offered choice. */
export function captureCleanseSource(snapshot: SecurityInspectionSnapshot, check: () => void): SecurityInspectionSnapshot {
  admitCleanseSource(snapshot, check);
  const captured = Object.freeze({
    identity: Object.freeze({ sessionId: snapshot.identity.sessionId, workspaceRoot: snapshot.identity.workspaceRoot }),
    version: snapshot.version,
    items: Object.freeze(snapshot.items.map(item => Object.freeze({
      identity: item.identity, kind: item.kind, id: item.id, targetId: item.targetId,
      status: item.status, durability: item.durability, owner: item.owner, summary: item.summary,
      detail: Object.freeze([...item.detail]),
    }))),
  });
  admitCleanseSource(captured, check);
  return captured;
}
