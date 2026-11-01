/**
 * Which command hooks may run, and how that is remembered.
 *
 * A hook is a shell command a configuration file asks the harness to run. When
 * that file arrives with a repository, running its commands is running the
 * repository's code, so the decision to do it belongs to the person who cloned
 * it — not to the file.
 *
 * Approval is remembered against a fingerprint of the hook rather than against
 * its name. A name is a label the author chooses and can be reused for a
 * different program. The fingerprint covers the event, the matcher, the command
 * and the file that declared it, so editing any of them — which is what changing
 * what will run looks like — invalidates the approval and asks again.
 *
 * The declaring file is part of that identity because approving a command in one
 * repository must not approve the same command arriving from another. Two
 * checkouts of the same project share a path only if they share a path; a second
 * repository shipping `./check.sh` is a different program to the person deciding,
 * whatever its text. The user's own hooks file is one path for every project, so
 * a decision about it is made once and holds everywhere — which is what makes it
 * the user's decision rather than a repository's.
 *
 * The record lives in the user's own directory. It has to: if it lived in the
 * workspace, a repository could ship a hook together with its own approval and
 * the gate would never ask anyone anything.
 */

import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { resolveUserDataFile } from "../../core/paths/userHome.js"
import { assertProfileStorage, currentProfile } from '../paths/profile/context.js';
import { HookTrustUpdateError, readHookTrust, updateHookTrust } from './trust/storage.js';

/** The parts of a hook that decide what it does, and where it came from. */
export interface HookIdentity {
  readonly event: string;
  readonly matcher?: string;
  readonly command: string;
  /**
   * The file that declared it.
   *
   * Part of the identity, not merely a label: it is what keeps an approval in
   * one repository from covering a different repository's hook.
   */
  readonly sourcePath: string;
}

/**
 * A stable fingerprint of what a hook will do, and where it came from.
 *
 * Serialized from an explicitly ordered array rather than from an object, so the
 * fingerprint does not depend on property insertion order — two configurations
 * that mean the same thing must produce the same fingerprint, or an approval
 * would appear to lapse for no reason.
 *
 * The path is resolved first so the same file named two ways is one hook. It is
 * deliberately not resolved through symlinks: a link whose target moves is a
 * different declaration of intent, and following it here would let one file's
 * approval follow the link somewhere else.
 */
export function hookFingerprint(hook: HookIdentity): string {
  const canonical = JSON.stringify([hook.event, hook.matcher ?? "", hook.command, path.resolve(hook.sourcePath)]);
  return createHash("sha256").update(canonical).digest("hex");
}

interface SessionApproval {
  readonly description: string;
  readonly sourcePath?: string;
  readonly revision: string;
}

export interface HookWithdrawal {
  readonly status: 'saved' | 'unverified';
  readonly removed: readonly { readonly fingerprint: string; readonly description: string }[];
}

/** The approvals this user has given, keyed by fingerprint in one source-aware store. */
export class HookTrustStore {
  private readonly profile = currentProfile();
  private readonly storePath: string;
  private readonly sessionApprovals = new Map<string, SessionApproval>();

  constructor(customPath?: string) {
    this.storePath = customPath ?? resolveUserDataFile('hook-trust.json');
    assertProfileStorage(this.storePath, this.profile);
  }

  /** Undefined is unavailable; an empty token is a readable source never withdrawn. */
  sourceRevision(sourcePath: string): string | undefined {
    try { return readHookTrust(this.storePath, this.profile).withdrawals[path.resolve(sourcePath)] ?? ''; }
    catch { return undefined; }
  }

  isTrusted(fingerprint: string, sourcePath?: string): boolean {
    try {
      const data = readHookTrust(this.storePath, this.profile);
      const memory = this.sessionApprovals.get(fingerprint);
      const source = sourcePath === undefined ? data.sources[fingerprint]?.sourcePath ?? memory?.sourcePath : path.resolve(sourcePath);
      const revision = source === undefined ? '' : data.withdrawals[source] ?? '';
      if (memory && (memory.sourcePath === undefined ? revision === '' : memory.sourcePath === source && memory.revision === revision)) return true;
      if (!Object.hasOwn(data.approved, fingerprint)) return false;
      const attribution = data.sources[fingerprint];
      if (attribution) return attribution.sourcePath === source && attribution.revision === revision;
      // Old hashes carry no reversible source. They remain usable elsewhere,
      // but a withdrawn source must ask again instead of adopting its old hash.
      return revision === '';
    } catch { return false; }
  }

  /** A stale answer cannot create a new grant. Failed publication may hold only the verified source generation in memory. */
  recordTrust(fingerprint: string, description = '', sourcePath?: string, expectedRevision?: string): boolean {
    assertProfileStorage(this.storePath, this.profile);
    const source = sourcePath === undefined ? undefined : path.resolve(sourcePath);
    let verifiedRevision: string | undefined;
    try {
      const saved = updateHookTrust(this.storePath, this.profile, data => {
        const revision = source === undefined ? '' : data.withdrawals[source] ?? '';
        if (expectedRevision !== undefined && revision !== expectedRevision) return { value: false };
        verifiedRevision = revision;
        const sources = { ...data.sources };
        if (source !== undefined) sources[fingerprint] = { sourcePath: source, revision };
        else delete sources[fingerprint];
        return { value: true, state: { ...data, approved: { ...data.approved, [fingerprint]: description }, sources } };
      });
      if (saved) this.sessionApprovals.delete(fingerprint);
      return saved;
    } catch (error) {
      // A lock/read failure never admitted this answer. Even a verified write
      // failure must reread the current source before it can hold a session grant.
      if (verifiedRevision === undefined) return false;
      try {
        const current = readHookTrust(this.storePath, this.profile);
        if ((source === undefined ? '' : current.withdrawals[source] ?? '') !== verifiedRevision) return false;
        const attribution = current.sources[fingerprint];
        if (Object.hasOwn(current.approved, fingerprint)
          && (source === undefined ? !attribution : attribution?.sourcePath === source && attribution.revision === verifiedRevision)) {
          this.sessionApprovals.delete(fingerprint);
          return true;
        }
        if (error instanceof HookTrustUpdateError && error.publicationVerified) {
          this.sessionApprovals.delete(fingerprint);
          return false;
        }
        this.sessionApprovals.set(fingerprint, { description, sourcePath: source, revision: verifiedRevision });
        return true;
      } catch { return false; }
    }
  }

  forgetTrust(fingerprint: string): boolean {
    assertProfileStorage(this.storePath, this.profile);
    const memory = this.sessionApprovals.delete(fingerprint);
    try {
      return updateHookTrust(this.storePath, this.profile, data => {
        if (!Object.hasOwn(data.approved, fingerprint)) return { value: memory };
        const approved = { ...data.approved }, sources = { ...data.sources };
        delete approved[fingerprint]; delete sources[fingerprint];
        return { value: true, state: { ...data, approved, sources } };
      });
    } catch { return false; }
  }

  /** Withdraw all historical grants for one declaring file, including unknown old hashes at lookup. */
  forgetSource(sourcePath: string, currentFingerprints: readonly string[] = []): HookWithdrawal {
    const source = path.resolve(sourcePath), current = new Set(currentFingerprints);
    try {
      const removed = updateHookTrust(this.storePath, this.profile, data => {
        const approved = { ...data.approved }, sources = { ...data.sources };
        const removed: HookWithdrawal['removed'][number][] = [];
        for (const [fingerprint, description] of Object.entries(approved)) {
          if (sources[fingerprint]?.sourcePath !== source && !current.has(fingerprint)) continue;
          removed.push({ fingerprint, description }); delete approved[fingerprint]; delete sources[fingerprint];
        }
        return { value: removed, state: { ...data, approved, sources, withdrawals: { ...data.withdrawals, [source]: randomUUID() } } };
      });
      for (const [fingerprint, approval] of this.sessionApprovals) {
        if (approval.sourcePath === source || current.has(fingerprint)) this.sessionApprovals.delete(fingerprint);
      }
      return { status: 'saved', removed };
    } catch { return { status: 'unverified', removed: [] }; }
  }

  entries(): ReadonlyArray<{ readonly fingerprint: string; readonly description: string }> {
    try { return Object.entries(readHookTrust(this.storePath, this.profile).approved).map(([fingerprint, description]) => ({ fingerprint, description })); }
    catch { return []; }
  }
}
