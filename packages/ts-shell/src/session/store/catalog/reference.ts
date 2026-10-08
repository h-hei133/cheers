import { normalizePathIdentity } from '../../continuation/roots.js';
import { validateSessionId, type SessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { locateCatalogDirectory } from './files.js';
import { CATALOG_LIMITS, type SessionReferenceQuery, type SessionReferenceResolution, type SessionSummary } from './model.js';

type ReadSummary = (id: string, signal?: AbortSignal, directory?: string) => Promise<SessionSummary | undefined>;

/** Resolve against discovery, not the visible recent-page limit. */
export async function resolveCatalogReference(
  layout: SessionStoreLayout,
  read: ReadSummary,
  reference: string,
  options: SessionReferenceQuery,
): Promise<SessionReferenceResolution> {
  const { signal } = options;
  signal?.throwIfAborted();
  const requested = reference.trim();
  if (!requested) return { ok: false, reason: 'not-found', candidates: [] };
  const lower = requested.toLowerCase();
  const latest = lower === 'last' || lower === 'latest';
  const root = options.projectRoot ? normalizePathIdentity(options.projectRoot) : undefined;
  if (options.strictProject && !root) return { ok: false, reason: 'incomplete', candidates: [] };
  const inProject = (summary: SessionSummary): boolean => normalizePathIdentity(summary.projectRoot) === root;
  let unreadable = false;
  if (!latest && validId(requested)) {
    try {
      if (await locateCatalogDirectory(layout, requested, signal)) {
        if (!options.strictProject) return { ok: true, sessionId: requested };
        const direct = await read(requested, signal);
        if (!direct) return { ok: false, reason: 'incomplete', candidates: [] };
        return inProject(direct) ? { ok: true, sessionId: direct.id }
          : { ok: false, reason: 'outside-project', candidates: [] };
      }
    } catch { signal?.throwIfAborted(); unreadable = true; }
  }

  let rank = Number.POSITIVE_INFINITY;
  let count = 0;
  let candidates: SessionSummary[] = [];
  let incompleteTitle = false;
  let incompleteRecency = false;
  const accept = (summary: SessionSummary): void => {
    if (options.strictProject && !inProject(summary)) return;
    incompleteTitle ||= !summary.titleComplete;
    incompleteRecency ||= summary.quality === 'limited';
    if (latest) {
      const current = candidates[0];
      if (!current || (root && inProject(summary) !== inProject(current)
        ? inProject(summary) : newer(summary, current))) candidates = [summary];
      count = candidates.length;
      return;
    }
    const nextRank = referenceRank(summary, lower);
    if (nextRank > rank || !Number.isFinite(nextRank)) return;
    if (nextRank < rank) { rank = nextRank; candidates = []; count = 0; }
    if (candidates.some(candidate => candidate.id === summary.id)) return;
    count++;
    if (candidates.length < 5) candidates.push(summary);
  };

  for await (const page of discoverSessions(layout, signal)) {
    unreadable ||= page.unreadable > 0;
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < page.ids.length) {
        signal?.throwIfAborted();
        const id = page.ids[next++]!;
        try {
          const summary = await read(id, signal, page.directory);
          if (summary) accept(summary);
        } catch { signal?.throwIfAborted(); unreadable = true; }
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(CATALOG_LIMITS.concurrency, page.ids.length) }, worker));
    signal?.throwIfAborted();
    const failed = settled.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  signal?.throwIfAborted();
  if (count > 1) return { ok: false, reason: 'ambiguous', candidates };
  if (unreadable || (latest ? incompleteRecency : rank >= 2 && incompleteTitle)) {
    return { ok: false, reason: 'incomplete', candidates };
  }
  const selected = candidates[0];
  if (!selected) return { ok: false, reason: 'not-found', candidates: [] };
  try {
    const current = await read(selected.id, signal);
    if (current?.version === selected.version) return { ok: true, sessionId: selected.id };
  } catch { signal?.throwIfAborted(); }
  return { ok: false, reason: 'incomplete', candidates };
}

function validId(value: string): boolean {
  // A long unquoted title is not a physical directory name.
  if (value.length > 255) return false;
  try { return validateSessionId(value) === value && value !== '.' && value !== '..'; }
  catch { return false; }
}

function referenceRank(summary: SessionSummary, reference: string): number {
  const id = summary.id.toLowerCase();
  if (id === reference) return 0;
  if (id.startsWith(reference)) return 1;
  if (summary.titleComplete && summary.title?.trim().toLowerCase().includes(reference)) return 2;
  return Number.POSITIVE_INFINITY;
}

function newer(left: SessionSummary, right: SessionSummary): boolean {
  const delta = (Date.parse(left.updatedAt) || 0) - (Date.parse(right.updatedAt) || 0);
  return delta !== 0 ? delta > 0 : left.id < right.id;
}
