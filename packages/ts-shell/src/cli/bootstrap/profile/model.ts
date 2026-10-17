import { createHash } from 'node:crypto';
import type { ProfileContext } from '../../../core/paths/profile/context.js';
import type { DirectoryIdentity } from '../../../core/paths/profile/identity.js';

export const MAX_SWITCH_DEPTH = 8;

export interface SwitchPlan {
  readonly version: 1;
  readonly source: ProfileContext;
  readonly target: ProfileContext;
  readonly workspace: DirectoryIdentity;
  readonly workingDirectory: DirectoryIdentity;
  readonly sourceSessionId: string;
  readonly generation: string;
  readonly depth: number;
  readonly offline: boolean;
}
export interface SwitchReceipt {
  readonly version: 1;
  readonly operation: string;
  readonly plan: SwitchPlan;
  readonly targetSessionId: string;
  readonly parentPid: number;
  status: 'prepared' | 'drained' | 'dispatched' | 'admitting' | 'admitted' | 'unknown';
  childPid?: number;
}
export interface SwitchTicket {
  readonly kind: 'profile-switch';
  readonly source: ProfileContext;
  readonly operation: string;
  readonly checkSource: () => void;
}
export function switchDigest(plan: SwitchPlan): string {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
export function switchArgs(plan: SwitchPlan): string[] {
  return ['--profile', plan.target.id, '--project', plan.workspace.path, ...(plan.offline ? ['--offline'] : [])];
}
