import type { PackageRecord } from '../model.js';
import { canonical, digest } from '../registry/validation.js';
import type { ExtensionAction } from './model.js';
import { safeText } from './text.js';

export interface ActionTarget { readonly view: ExtensionAction; readonly args: readonly string[] }
export function actionTarget(args: readonly string[], detail: string, input?: 'release'): ActionTarget {
  return { args, view: { id: digest(canonical(args)), label: safeText(args.join(' ')), detail, ...(input ? { input } : {}) } };
}
export const installTarget = actionTarget(['install'], 'Review an exact signed source:name@version. Installation starts with activation and grants empty.', 'release');
export function packageActions(record: PackageRecord, root: string, workspaceIdentity: string): readonly ActionTarget[] {
  const activation = record.activation[root];
  const current = activation?.workspaceIdentity === workspaceIdentity;
  const enabled = current && activation.enabled;
  const grants = current ? activation.grants : [];
  const declared = [...(record.active.manifest.skills.length ? ['prompt'] : []),
    ...record.active.manifest.scripts.map(entry => `script:${entry.name}`),
    ...record.active.manifest.commands.map(entry => `command:${entry.name}`),
    ...record.active.manifest.tools.map(entry => `tool:${entry.name}`)];
  const versions = [...new Set(record.history.map(entry => entry.manifest.version))];
  return [
    actionTarget([enabled ? 'disable' : 'enable', record.name], 'Changes enablement for this workspace. Enablement grants no capabilities.'),
    actionTarget(['update', record.name], 'Review another exact signed release. Activation and grants will clear.', 'release'),
    ...versions.map(version => {
      const selected = record.history.find(entry => entry.manifest.version === version)!;
      return actionTarget(['rollback', record.name, version], `Retained SHA256 ${selected.digest}. Activation and grants will clear.`);
    }),
    ...[...new Set([...declared, ...grants])].map(grant => actionTarget([grants.includes(grant) ? 'revoke' : 'grant', record.name, grant],
      grants.includes(grant) ? 'Revoke this workspace capability.' : 'Grant this declared capability separately. Executions still require ordinary approval.')),
    actionTarget(['uninstall', record.name], 'Remove reviewed intact owned versions. Preserve user data and unknown content.'),
  ];
}
