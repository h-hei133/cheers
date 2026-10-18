import { createHash } from 'node:crypto';
import type { AdvisorConfig, AdvisorTarget } from './model.js';

export interface AdvisorTargetHost {
  readonly validateTarget?: (target: string) => void;
  readonly resolveTarget?: (target?: string) => AdvisorTarget;
}

/** Explicit configuration wins; only the native host can resolve an automatic role. */
export function resolveAdvisorTarget(host: AdvisorTargetHost, config: AdvisorConfig): AdvisorTarget {
  if (config.target) host.validateTarget?.(config.target);
  if (host.resolveTarget) return host.resolveTarget(config.target);
  if (!config.target) throw new Error('Advisor role is unavailable.');
  return { model: config.target, label: config.target, identity: createHash('sha256').update(config.target).digest('hex') };
}

export function advisorTargetCurrent(host: AdvisorTargetHost, config: AdvisorConfig, identity: string): boolean {
  try { return resolveAdvisorTarget(host, config).identity === identity; }
  catch { return false; }
}
