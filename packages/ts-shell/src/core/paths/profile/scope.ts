import { createHash } from 'node:crypto';
import { assertProfileIdentity, currentProfile, type ProfileContext } from './context.js';

/** Process-local stores use the same owner identity as durable state, without exposing paths. */
export function profileScope(scope: string, profile: ProfileContext | undefined = currentProfile()): string {
  if (!profile || profile.id === 'default') return scope;
  assertProfileIdentity(profile);
  const identity = createHash('sha256').update(`${profile.root}\0${profile.rootIdentity}`).digest('hex');
  return `profile:${profile.id}:${identity}:${scope}`;
}
