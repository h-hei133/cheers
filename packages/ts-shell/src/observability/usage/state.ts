import { currentProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import { userHomeDir } from '../../core/paths/userHome.js';
import path from 'node:path';
import type { SessionUsageTelemetry } from './model.js';

const profiles = new WeakMap<ProfileContext, Map<string, SessionUsageTelemetry>>();
const homes = new Map<string, Map<string, SessionUsageTelemetry>>();
const owners = new WeakMap<SessionUsageTelemetry, () => void>();

export function sessionTelemetries(): Map<string, SessionUsageTelemetry> {
  const profile = currentProfile();
  if (!profile) {
    const home = path.resolve(userHomeDir());
    let sessions = homes.get(home);
    if (!sessions) { sessions = new Map(); homes.set(home, sessions); }
    return sessions;
  }
  let sessions = profiles.get(profile);
  if (!sessions) { sessions = new Map(); profiles.set(profile, sessions); }
  return sessions;
}

/** A replaced session must never consume the previous owner's pending counters. */
export function currentUsage(sessionId: string, sessions = sessionTelemetries()): SessionUsageTelemetry | undefined {
  const usage = sessions.get(sessionId);
  if (!usage) return undefined;
  try { owners.get(usage)?.(); return usage; }
  catch { sessions.delete(sessionId); return undefined; }
}

export function bindUsageOwner(usage: SessionUsageTelemetry, validate: () => void): void {
  owners.set(usage, validate);
}
