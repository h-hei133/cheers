import type { ClaimRecord, ClaimReference, ResearchDraft, SourceRecord } from './model.js';
import type { ResearchBrief } from '../brief/model.js';
import { safeText } from './producer.js';

export function validateReference(reference: ClaimReference, sources: readonly SourceRecord[]): SourceRecord {
  const source = sources.find(source => source.id === reference.sourceId);
  const excerpt = source?.excerpts.find(excerpt => excerpt.id === reference.excerptId);
  if (!source || source.stale || !['metadata', 'abstract', 'read', 'truncated'].includes(source.status) || !source.contentHash
    || !excerpt || !reference.quote.trim() || !excerpt.text.includes(reference.quote)) throw new Error('Research citation does not bind to an available source excerpt.');
  return source;
}

export function validateDraft(draft: ResearchDraft, brief: ResearchBrief, sources: readonly SourceRecord[]): ResearchDraft {
  const ids = new Set(brief.questions.map(question => question.id));
  if (new Set(draft.claims.map(claim => claim.id)).size !== draft.claims.length
    || [...draft.covered, ...draft.uncovered].some(id => !ids.has(id))) throw new Error('Research coverage has unknown or duplicate identifiers.');
  const claims = draft.claims.map(claim => validateClaim(claim, ids, sources));
  const covered = draft.covered.filter(id => claims.some(claim => claim.questionId === id && claim.support !== 'insufficient'));
  const uncovered = [...new Set([...draft.uncovered, ...brief.questions.map(question => question.id).filter(id => !covered.includes(id))])];
  return { ...draft, claims, covered, uncovered };
}

function validateClaim(claim: ClaimRecord, questions: ReadonlySet<string>, sources: readonly SourceRecord[]): ClaimRecord {
  if (!questions.has(claim.questionId)) throw new Error('Research claim refers to an unknown subquestion.');
  const supporting = claim.supporting.map(reference => validateReference(reference, sources));
  claim.opposing.forEach(reference => validateReference(reference, sources));
  if (claim.support === 'direct' && !supporting.length) throw new Error('A direct claim requires an actual supporting source excerpt.');
  if (claim.support === 'opposed' && !claim.opposing.length) throw new Error('An opposed claim requires actual counterevidence.');
  if (claim.support === 'indirect' && !supporting.length) {
    return { ...claim, support: 'insufficient', supportReason: safeText(['No actual supporting source excerpt was obtained.', claim.supportReason].filter(Boolean).join(' '), 4096),
      limitations: addLimitation(claim.limitations, 'Indirect support requires actual supporting evidence.') };
  }
  if (claim.kind === 'method' || claim.kind === 'evaluation') {
    if (claim.support !== 'insufficient' && !supporting.some(source => source.status === 'read' || source.status === 'truncated')) {
      return { ...claim, support: 'insufficient', supportReason: 'Only metadata/abstract evidence was obtained for this method/evaluation claim.',
        limitations: addLimitation(claim.limitations, 'Fulltext method/evaluation evidence is missing.') };
    }
  }
  // Replica counts and review outcomes never upgrade this declared support.
  return claim;
}

function addLimitation(current: readonly string[], limitation: string): readonly string[] {
  return current.length < 32 ? [...current, limitation] : [...current.slice(0, 31), safeText(`${limitation} ${current[31]}`, 4096)];
}

export function mergeSources(current: readonly SourceRecord[], incoming: readonly SourceRecord[]): { readonly sources: readonly SourceRecord[]; readonly changed: readonly string[] } {
  const sources = [...current]; const changed: string[] = [];
  for (const source of incoming) {
    const same = sources.findIndex(old => old.id === source.id);
    const previous = sources.filter(old => old.id !== source.id && old.locator === source.locator && old.hashScope === source.hashScope
      && (source.hashScope === 'source-bytes' || old.readKey === source.readKey) && !old.stale);
    for (const old of previous) {
      if (old.contentHash && source.contentHash && old.contentHash !== source.contentHash) {
        const index = sources.indexOf(old); sources[index] = { ...old, stale: true }; changed.push(old.id);
      }
    }
    const replicas = sources.filter(old => old.id !== source.id && !old.stale && (
      old.contentHash && old.contentHash === source.contentHash && old.hashScope === source.hashScope
      || old.kind === 'paper' && source.kind === 'paper' && old.identifiers?.doi && old.identifiers.doi === source.identifiers?.doi
        && old.identifiers.version === source.identifiers.version
        && (!old.identifiers.arxiv || !source.identifiers.arxiv || old.identifiers.arxiv === source.identifiers.arxiv)));
    for (const replica of replicas) {
      const index = sources.indexOf(replica); sources[index] = { ...replica, replicas: [...new Set([...replica.replicas, source.id])] };
    }
    const refreshed = { ...source, stale: false, replicas: [...new Set([...source.replicas, ...replicas.map(replica => replica.id)])] };
    if (same >= 0) sources[same] = refreshed; else sources.push(refreshed);
  }
  if (sources.length > 96) throw new Error('Research source retention limit reached; coverage is partial.');
  return { sources, changed };
}
