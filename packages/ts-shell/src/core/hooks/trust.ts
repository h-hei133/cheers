/**
 * Which command hooks may run, and how that is remembered.
 *
 * A hook is a shell command a configuration file asks the harness to run. When
 * that file arrives with a repository, running its commands is running the
 * repository's code, so the decision to do it belongs to the person who cloned
 * it — not to the file.
 *
 * Approval is remembered against a fingerprint of the hook rather than against
 * its name or its file. A name is a label the author chooses and can be reused
 * for a different program; a file path stays the same while its contents change.
 * The fingerprint covers the event, the matcher and the command, so editing any
 * of them — which is what changing what will run looks like — invalidates the
 * approval and asks again.
 *
 * The record lives in the user's own directory. It has to: if it lived in the
 * workspace, a repository could ship a hook together with its own approval and
 * the gate would never ask anyone anything.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveUserDataFile, userDataDir } from "../../core/paths/userHome.js"
import { assertProfileStorage, currentProfile } from '../paths/profile/context.js';

/** The parts of a hook that decide what it does. */
export interface HookIdentity {
  readonly event: string;
  readonly matcher?: string;
  readonly command: string;
}

interface TrustFile {
  readonly version: 1;
  readonly approved: Record<string, string>;
}

/**
 * A stable fingerprint of what a hook will do.
 *
 * Serialized from an explicitly ordered array rather than from an object, so the
 * fingerprint does not depend on property insertion order — two configurations
 * that mean the same thing must produce the same fingerprint, or an approval
 * would appear to lapse for no reason.
 */
export function hookFingerprint(hook: HookIdentity): string {
  const canonical = JSON.stringify([hook.event, hook.matcher ?? "", hook.command]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** The approvals this user has given, keyed by fingerprint. */
export class HookTrustStore {
  private readonly profile = currentProfile();
  private readonly storePath: string;
  /** Approvals given during this session, for a store that cannot be written. */
  private readonly sessionApprovals = new Set<string>();

  constructor(customPath?: string) {
    this.storePath =
      customPath ??
      resolveUserDataFile("hook-trust.json");
    assertProfileStorage(this.storePath, this.profile);
  }

  isTrusted(fingerprint: string): boolean {
    try { assertProfileStorage(this.storePath, this.profile); } catch { return false; }
    if (this.sessionApprovals.has(fingerprint)) return true;
    return this.read().approved[fingerprint] !== undefined;
  }

  /** Remember an approval, for this session and for later ones. */
  recordTrust(fingerprint: string, description = ""): void {
    assertProfileStorage(this.storePath, this.profile);
    this.sessionApprovals.add(fingerprint);
    const data = this.read();
    const approved = { ...data.approved, [fingerprint]: description };
    this.write({ version: 1, approved });
  }

  private read(): TrustFile {
    try {
      assertProfileStorage(this.storePath, this.profile);
      const parsed = JSON.parse(fs.readFileSync(this.storePath, "utf8")) as TrustFile;
      if (parsed?.version === 1 && parsed.approved) return parsed;
    } catch {
      // Absent or unreadable means nothing has been approved, which is the safe
      // reading: an unreadable record must not grant what it cannot show.
    }
    return { version: 1, approved: {} };
  }

  private write(data: TrustFile): void {
    try {
      assertProfileStorage(this.storePath, this.profile);
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      const temporary = `${this.storePath}.tmp-${process.pid}-${Date.now()}`;
      assertProfileStorage(temporary, this.profile);
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
      assertProfileStorage(this.storePath, this.profile);
      fs.renameSync(temporary, this.storePath);
    } catch {
      // The session approval still holds; only persistence was lost.
    }
  }
}
