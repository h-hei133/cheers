import os from 'node:os';
import { randomUUID } from 'node:crypto';

export interface ProcessOwner {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: string;
}

export function createProcessOwner(): ProcessOwner {
  return { token: randomUUID(), pid: process.pid, hostname: os.hostname(), startedAt: new Date().toISOString() };
}

/** Only a matching host and ESRCH prove local death; age and foreign PIDs prove nothing. */
export function processOwnerDisposition(owner: ProcessOwner): 'live' | 'dead' | 'unknown' {
  if (owner.hostname !== os.hostname()) return 'unknown';
  try { process.kill(owner.pid, 0); return 'live'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}
