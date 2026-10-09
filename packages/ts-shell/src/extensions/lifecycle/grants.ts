import fs from 'node:fs';
import { canonical } from '../registry/validation.js';
import { selectedSource, sourceIdentity } from '../registry/sources.js';
import { assertPackage, type LifecycleHost, type Operation } from './install.js';
import type { PackageRecord } from '../model.js';
import { getInstalledPlugins } from '../../core/commands/plugin/store.js';
import path from 'node:path';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

export function rootIdentity(root: string): string { return fs.realpathSync(root); }
export function rootSignature(root: string): string { return captureWorkspaceRoot(root, root, 'read').identity; }
export function validGrant(record: PackageRecord, grant: string): void {
  const manifest = record.active.manifest;
  if (grant === 'prompt' && manifest.skills.length) return;
  const [kind, target, extra] = grant.split(':');
  if (extra || !target || !['script', 'command', 'tool'].includes(kind!)) throw new Error('Select a declared prompt, script, command or tool grant.');
  const entries = kind === 'script' ? manifest.scripts : kind === 'command' ? manifest.commands : manifest.tools;
  if (!entries.some(entry => entry.name === target)) throw new Error('That capability was not declared by this exact installed version.');
}
export function activationOperation(host: LifecycleHost, root: string, action: 'enable' | 'disable' | 'grant' | 'revoke', packageName: string, grant?: string): Operation {
  host.check(); const state = host.store.read(); const record = state.packages.find(entry => entry.name === packageName);
  if (!record) throw new Error('Extension is not installed.'); const scope = rootIdentity(root); const workspaceIdentity = rootSignature(root);
  if (action !== 'disable' && action !== 'revoke') {
    assertPackage(record, host.store);
    if (sourceIdentity(selectedSource(record.active.source)) !== record.active.sourceIdentity) throw new Error('Installed source or trust anchor changed; new reviewed installation is required.');
  }
  if (grant) validGrant(record, grant);
  if ((action === 'grant' || action === 'revoke') && !grant) throw new Error('A separate declared capability grant is required.');
  return { preview: `${action} ${packageName}${grant ? ` ${grant}` : ''}\nWorkspace ${scope}\nSource ${record.active.source}; version ${record.active.manifest.version}; SHA256 ${record.active.digest}\nDeclared permissions ${canonical(record.active.manifest.permissions)}\nEnablement does not grant prompt or executable capabilities. Every execution still uses ordinary approval.`, apply: async context => {
    context.abortSignal?.throwIfAborted(); host.check(); if (rootIdentity(root) !== scope || rootSignature(root) !== workspaceIdentity) throw new Error('Approved workspace identity changed.');
    const outcome = host.store.locked(state, current => {
      host.check(); if (action === 'enable' || action === 'grant') { assertPackage(record, host.store); if (sourceIdentity(selectedSource(record.active.source)) !== record.active.sourceIdentity) throw new Error('Approved extension source changed.'); }
      const previous = record.activation[scope]; const before = previous?.workspaceIdentity === workspaceIdentity ? previous : { enabled: false, grants: [] };
      const activation = { ...record.activation, [scope]: { workspaceIdentity, enabled: action === 'enable' ? true : action === 'disable' ? false : before.enabled,
        grants: action === 'grant' ? [...new Set([...before.grants, grant!])] : action === 'revoke' ? before.grants.filter(entry => entry !== grant) : before.grants } };
      return host.store.publish({ ...current, packages: current.packages.map(entry => entry.name === packageName ? { ...record, activation } : entry) }, { effect: 'saved', detail: `${packageName} ${action}${grant ? ` ${grant}` : ''} saved for this workspace.` });
    });
    await host.invalidate(context.abortSignal); return outcome;
  } };
}
export function migrationOperation(host: LifecycleHost): Operation {
  const state = host.store.read(); const legacy = getInstalledPlugins();
  const imported = legacy.map(entry => ({ name: entry.name, version: entry.version, spec: entry.spec, status: 'unresolved' as const }));
  if (imported.length + state.imports.length > 64) throw new Error('Legacy extension import limit exceeded.');
  return { preview: `Import ${imported.length} legacy registrations as unresolved; preserve original files and source specifications. Old enabled/resolved flags grant no new authority.`, apply: async context => {
    host.check(); context.abortSignal?.throwIfAborted();
    const outcome = host.store.locked(state, current => {
      if (canonical(getInstalledPlugins()) !== canonical(legacy)) throw new Error('Approved legacy registry changed.');
      const imports = [...current.imports, ...imported.filter(entry => !current.imports.some(previous => previous.name === entry.name && previous.spec === entry.spec))];
      return host.store.publish({ ...current, imports }, { effect: 'saved', detail: `${imported.length} legacy registrations imported as unresolved; legacy data preserved.` });
    });
    await host.invalidate(context.abortSignal); return outcome;
  } };
}
export function registrationOperation(host: LifecycleHost, input: string): Operation {
  if (!input || input.length > 2048 || /[\x00-\x1f]/.test(input)) throw new Error('A bounded legacy source specification is required.');
  const state = host.store.read(); if (state.imports.length >= 64) throw new Error('Legacy registration limit reached.');
  const local = input.startsWith('.') || input.startsWith('/') || input.startsWith('~');
  const imported = { name: (local ? path.basename(input.replace(/\/$/, '')) : input).toLowerCase().replace(/[^a-z0-9_-]/g, '-'), spec: input, version: 'unresolved', status: 'unresolved' as const };
  if (!imported.name || state.imports.some(entry => entry.name === imported.name)) throw new Error('Legacy registration name is missing or already registered.');
  return { preview: `Register ${input} explicitly as unresolved legacy data. No installed files, activation or capability grants are created.`, apply: async context => {
    host.check(); context.abortSignal?.throwIfAborted();
    return host.store.locked(state, current => host.store.publish({ ...current, imports: [...current.imports, imported] }, { effect: 'saved', detail: `${imported.name} legacy specification registered as unresolved; no package downloaded or code executed.` }));
  } };
}
