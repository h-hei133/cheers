import path from 'node:path';
import { userDataDir } from '../../paths/userHome.js';
import { TRUST_LEVELS, TrustWriteError, type ProjectTrustLevel, type TrustDecision, type TrustWriteResult } from './model.js';
import { identifyProject, covers } from './identity.js';
import { hasSensitiveProjectResources } from './resources.js';
import { readTrustSnapshot, saveTrustDecision, trustRevision } from './storage.js';
import { trustSource } from './source.js';

/** One decision for every reader. Volatile grants belong to this process only. */
export class ProjectTrustStore {
  private static instance?: ProjectTrustStore;
  private readonly grants = new Set<string>();
  private observedRevision?: string;
  private generation = 0;
  constructor(private readonly customPath?: string) {}

  static getShared(): ProjectTrustStore {
    return ProjectTrustStore.instance ??= new ProjectTrustStore();
  }

  private source(): string { return this.customPath ?? trustSource(); }
  private target(): string { return this.customPath ?? path.join(userDataDir(), 'trust.json'); }

  private diskRevision(): string {
    const revision = trustRevision(this.source());
    if (this.observedRevision !== revision) { this.grants.clear(); this.observedRevision = revision; }
    return revision;
  }

  revision(): string { return `${this.generation}:${this.diskRevision()}`; }

  decision(workspaceRoot: string): TrustDecision {
    const normalized = identifyProject(workspaceRoot);
    try {
      const before = this.diskRevision();
      const snapshot = readTrustSnapshot(this.source());
      if (before !== this.diskRevision()) return 'unavailable';
      // Saved allows are canonical identities at approval time, never new link targets.
      // Refusals retain their saved boundary and also cover legacy aliases conservatively.
      const records = Object.entries(snapshot.value.projects).flatMap(([root, record]) =>
        (record.trustLevel === 'untrusted' ? [path.resolve(root), identifyProject(root)] : [path.resolve(root)])
          .map(identity => [identity, record] as const));
      // Refusal of a subtree stays effective even if an older child allow exists.
      // An explicit volatile choice only shadows a durable refusal at that same path.
      if (records.some(([root, record]) => record.trustLevel === 'untrusted' && covers(root, normalized) && !this.grants.has(root))) return 'untrusted';
      if ([...this.grants].some(root => covers(root, normalized)) || records.some(([root, record]) => record.trustLevel === 'trusted' && covers(root, normalized))) return 'trusted';
      return 'undecided';
    } catch {
      if (this.grants.size) { this.grants.clear(); this.generation++; }
      return 'unavailable';
    }
  }

  isProjectTrusted(workspaceRoot: string): boolean { return this.decision(workspaceRoot) === 'trusted'; }

  /** Unavailable decisions fail closed; a missing decision remains undecided. */
  isProjectUntrusted(workspaceRoot: string): boolean {
    const decision = this.decision(workspaceRoot);
    return decision === 'untrusted' || decision === 'unavailable';
  }

  setProjectTrust(workspaceRoot: string, level: ProjectTrustLevel): TrustWriteResult {
    if (!TRUST_LEVELS.some(candidate => candidate === level)) throw new TypeError('Invalid project trust level.');
    const root = identifyProject(workspaceRoot);
    if (level === 'session-only') {
      if (this.decision(root) === 'unavailable') throw new TrustWriteError('read-failed', 'unchanged');
      const changed = !this.grants.has(root);
      this.grants.add(root); this.generation++;
      return { scope: 'process', changed };
    }
    const changed = saveTrustDecision({ source: () => this.source(), target: this.target() }, root, path.resolve(workspaceRoot), level);
    this.grants.clear(); this.observedRevision = trustRevision(this.source()); this.generation++;
    return { scope: 'durable', changed };
  }

  hasSensitiveProjectResources(workspaceRoot: string): boolean { return hasSensitiveProjectResources(workspaceRoot); }
}

export const projectTrust = ProjectTrustStore.getShared();
