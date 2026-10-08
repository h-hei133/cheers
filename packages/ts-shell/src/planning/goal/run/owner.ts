import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { GoalRunOwner } from './model.js';

export function createRunOwner(): GoalRunOwner {
  return { token: randomUUID(), pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() };
}

/** Only a matching host and ESRCH prove local death; age and foreign PIDs prove nothing. */
export function ownerDisposition(owner: GoalRunOwner): 'live' | 'dead' | 'unknown' {
  if (owner.hostname !== os.hostname()) return 'unknown';
  try { process.kill(owner.pid, 0); return 'live'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}
