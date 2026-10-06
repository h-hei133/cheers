import type { ConfigField } from './fields.js';
import { projectTrust } from '../core/security/trust/store.js';
import { identifyProject } from '../core/security/trust/identity.js';
import type { TrustDecision } from '../core/security/trust/model.js';

export interface ConfigTrustBinding {
  readonly workspaceRoot: string;
  readonly revision: string;
  readonly decision: TrustDecision;
}

export function captureConfigTrust(root: string): ConfigTrustBinding {
  const revision = projectTrust.revision();
  const workspaceRoot = identifyProject(root);
  return { workspaceRoot, revision, decision: projectTrust.decision(workspaceRoot) };
}

export function configTrustMatches(binding: ConfigTrustBinding, root: string, revision: string): boolean {
  return binding.workspaceRoot === identifyProject(root) && binding.revision === revision;
}

export function configTrustRejection(field: ConfigField, value: unknown, decision: TrustDecision): string | undefined {
  if (decision === 'trusted' || field.projectTrust === 'safe') return undefined;
  if (Array.isArray(field.projectTrust) && field.projectTrust.some(allowed => allowed === value)) return undefined;
  return decision === 'undecided' ? 'trust-not-established' : decision === 'untrusted' ? 'trust-denied' : 'trust-unavailable';
}

export function configTrustNotice(reason: string): string | undefined {
  if (reason === 'trust-not-established') return 'Project trust has not been established.';
  if (reason === 'trust-denied') return 'The project is marked untrusted.';
  if (reason === 'trust-unavailable') return 'The project trust decision is unavailable.';
  return undefined;
}
