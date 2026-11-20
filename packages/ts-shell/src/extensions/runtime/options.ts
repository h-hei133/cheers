import { assertInventory } from '../archive/storage.js';
import { rootIdentity, rootSignature } from '../lifecycle/grants.js';
import type { PackageRecord, ExtensionManifest } from '../model.js';
import { assertVersionSource } from '../registry/sources.js';
import { canonical } from '../registry/validation.js';
import { ExtensionStore, versionPath } from '../store/state.js';

type InstalledFlag = NonNullable<ExtensionManifest['flags']>[number];

export interface InstalledOption {
  readonly flag: InstalledFlag;
  readonly source: { readonly entry: string; readonly canonical: string };
  readonly check: () => void;
}

export interface InstalledOptionValue {
  readonly option: InstalledOption;
  readonly value: string | boolean;
}

/** Discover declarations from admitted installation metadata before a session can be activated. */
export function installedOptions(workspace: string, store = new ExtensionStore()): readonly InstalledOption[] {
  const root = rootIdentity(workspace);
  const signature = rootSignature(root);
  if (store.outcomes.some(outcome => outcome.durability === 'unknown')) throw new Error('Installed extension publication is uncertain.');
  return store.read().packages.flatMap(record => {
    const activation = record.activation[root];
    if (!activation?.enabled || activation.workspaceIdentity !== signature) return [];
    const flags = record.active.manifest.flags?.filter(flag => activation.grants.includes(`script:${flag.script}`));
    if (!flags?.length) return [];
    const owned = versionPath(record.active, store.file);
    assertVersionSource(record.active);
    assertInventory(owned, record.active);
    const active = canonical(record.active);
    return flags.map(flag => Object.freeze({ flag: Object.freeze({ ...flag }),
      source: Object.freeze({ entry: `${owned}#${flag.script}`, canonical: `${record.active.digest}#${flag.script}` }),
      check: () => {
        if (rootIdentity(workspace) !== root || rootSignature(root) !== signature
          || store.outcomes.some(outcome => outcome.durability === 'unknown')) throw new Error('Installed extension option source changed.');
        const current = store.read().packages.find(entry => entry.name === record.name);
        const grant = current?.activation[root];
        if (!current || !grant?.enabled || grant.workspaceIdentity !== signature
          || !grant.grants.includes(`script:${flag.script}`) || canonical(current.active) !== active) {
          throw new Error('Installed extension option source changed.');
        }
        assertVersionSource(current.active);
        assertInventory(owned, current.active);
      },
    }));
  });
}

export function scriptOptions(record: PackageRecord, file: string, script: string, values: readonly InstalledOptionValue[] | undefined) {
  const flags = record.active.manifest.flags;
  if (!flags?.length) return [];
  const owned = versionPath(record.active, file);
  return flags.filter(flag => flag.script === script).map(flag => {
    const override = values?.find(({ option }) => option.flag.name === flag.name
      && option.source.entry === `${owned}#${script}` && option.source.canonical === `${record.active.digest}#${script}`);
    override?.option.check();
    const { script: _script, ...definition } = flag;
    return { definition, ...(override ? { value: override.value } : {}) };
  });
}
