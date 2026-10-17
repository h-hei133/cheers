import { currentProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import type { SessionUsageTelemetry } from './model.js';

const profiles = new WeakMap<ProfileContext, Map<string, SessionUsageTelemetry>>();
const unscoped = new Map<string, SessionUsageTelemetry>();

export function sessionTelemetries(): Map<string, SessionUsageTelemetry> {
  const profile = currentProfile();
  if (!profile) return unscoped;
  let sessions = profiles.get(profile);
  if (!sessions) { sessions = new Map(); profiles.set(profile, sessions); }
  return sessions;
}
