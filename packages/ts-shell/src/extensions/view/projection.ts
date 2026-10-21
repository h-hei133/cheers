import type { ExtensionSource, ExtensionState } from '../model.js';
import { canonical, digest } from '../registry/validation.js';
import { sourceIdentity } from '../registry/sources.js';
import type { ExtensionSnapshot } from './model.js';
import { installTarget, packageActions } from './actions.js';
import { safeText } from './text.js';

export function packageKey(name: string): string { return digest(name); }
export function projectExtensions(state: ExtensionState, sources: readonly ExtensionSource[] | undefined, root: string,
  workspaceIdentity: string, version: string, errors: readonly string[], outcomes: readonly string[], offline: boolean): ExtensionSnapshot {
  return {
    version, mutationBlocked: outcomes.length > 0, install: installTarget.view,
    notices: [
      'Installation, enablement and capability grants are separate. Execution requires Linux bubblewrap, current policy and ordinary approval.',
      ...(offline ? ['Offline: registry requests are unavailable.'] : []),
      ...(sources ? [] : ['Source registry unavailable; source trust is unknown.']),
      ...errors.map(safeText), ...outcomes.map(detail => safeText(`${detail}; durability unknown`)),
      ...state.imports.map(entry => safeText(`${entry.name}: unresolved legacy registration; grants no runtime authority.`)),
    ],
    items: state.packages.map(record => {
      const active = record.active; const activation = record.activation[root];
      const current = activation?.workspaceIdentity === workspaceIdentity;
      const source = sources?.find(entry => entry.name === active.source);
      const trust = !sources ? 'unknown' : !source ? 'missing' : !source.trust ? 'untrusted'
        : sourceIdentity(source) === active.sourceIdentity && source.trust.fingerprint === active.trustFingerprint ? 'current' : 'changed';
      const status = activation && !current ? 'stale workspace activation' : current && activation.enabled ? 'enabled in this workspace' : 'disabled in this workspace';
      return { id: packageKey(record.name), label: safeText(record.name), description: safeText(active.manifest.description ?? ''),
        status, detail: [safeText(`${record.name}@${active.manifest.version}`), safeText(active.manifest.description ?? ''),
          safeText(`Source ${active.source}; trust ${trust}`), `SHA256 ${active.digest}`, `Trust fingerprint ${active.trustFingerprint}`,
          status, safeText(`Workspace permissions: ${active.manifest.permissions.workspace}; network: ${active.manifest.permissions.network}`),
          safeText(`Grants: ${current ? activation.grants.join(', ') || 'none' : 'none current'}`),
          ...record.history.map(entry => safeText(`Retained ${entry.manifest.version}; source ${entry.source}; SHA256 ${entry.digest}`)),
          ...record.active.manifest.commands.map(entry => safeText(`Command ${entry.name}: ${entry.description}`)),
          ...record.active.manifest.tools.map(entry => safeText(`Tool ${entry.name}: ${entry.description}`))],
        actions: packageActions(record, root, workspaceIdentity).map(target => target.view) };
    }),
  };
}

export function inspectionVersion(value: unknown): string { return digest(canonical(value)); }
