import fs from 'node:fs';
import path from 'node:path';
import { changeSources, readSources, selectedSource, sourceIdentity, sourceUrl, trustAnchor } from '../registry/sources.js';
import { canonical, name } from '../registry/validation.js';
import { details, search } from '../registry/client.js';
import type { ExtensionService } from '../service.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import type { ExtensionSource } from '../model.js';

export async function marketplaceCommand(args: string[], service: ExtensionService): Promise<LocalCommandResult> {
  try {
    service.check(); const [action = 'list', target, input, extra, ...rest] = args;
    if (rest.length) throw new Error('Too many marketplace arguments.');
    if (['list', 'ls'].includes(action) && !target) return { kind: 'local', output: readSources().map(source => `${source.name}: ${source.url}; ${source.trust ? `trusted ${source.trust.keyId} ${source.trust.fingerprint}; provenance ${source.trust.provenance}` : 'registered, untrusted'}`).join('\n') || 'No marketplace sources registered.' };
    if (action === 'search' && target && input) { const source = selectedSource(target); const page = await service.request(signal => search(source, input, extra, signal, service.offline())); if (sourceIdentity(selectedSource(target)) !== sourceIdentity(source)) throw new Error('Selected source changed during query.'); return { kind: 'local', output: `${JSON.stringify(page, null, 2)}\nQuery only; no package installed or enabled.` }; }
    if (action === 'details' && target && input && !extra) { const source = selectedSource(target); const result = await service.request(signal => details(source, input, signal, service.offline())); if (sourceIdentity(selectedSource(target)) !== sourceIdentity(source)) throw new Error('Selected source changed during query.'); return { kind: 'local', output: JSON.stringify(result, null, 2) }; }
    const before = readSources(); const identity = canonical(before); let next: ExtensionSource[]; let recheck = () => {};
    if (action === 'add' && target && input && !extra) {
      const selected = name(target); sourceUrl(input); if (before.some(entry => entry.name === selected)) throw new Error('Marketplace source already registered.');
      next = [...before, { name: selected, url: input }];
    } else if (['remove', 'rm', 'delete'].includes(action) && target && !input) {
      if (!before.some(entry => entry.name === target)) throw new Error('Marketplace source is not registered.'); next = before.filter(entry => entry.name !== target);
    } else if (action === 'trust' && target && input && extra) {
      const source = selectedSource(target); const expected = sourceIdentity(source); const file = path.resolve(service.root, extra); service.assertSourceAccess(file); const stat = fs.lstatSync(file, { bigint: true });
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Select a bounded public SPKI PEM file.');
      const publicKey = fs.readFileSync(file, 'utf8'); const trust = trustAnchor(input, publicKey, `explicit-user-file:${file}`);
      recheck = () => { service.assertSourceAccess(file); const current = fs.lstatSync(file, { bigint: true }); if (!current.isFile() || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino || current.birthtimeMs !== stat.birthtimeMs || current.size > 4096 || fs.readFileSync(file, 'utf8') !== publicKey) throw new Error('Approved public-key source changed.'); };
      recheck();
      next = before.map(entry => sourceIdentity(entry) === expected ? { ...entry, trust } : entry);
    } else throw new Error('Usage: /marketplace list | add <name> <url> | remove <name> | trust <name> <keyId> <public-key-file> | search <source> <query> [cursor] | details <source> <package>');
    const output = await service.approve({ preview: `${action} marketplace source ${target}\n${canonical(next)}\nSource registration and trust grant no install, enable, prompt or script authority.`, apply: async context => {
      service.check(); context.abortSignal?.throwIfAborted(); recheck();
      changeSources(current => { if (canonical(current) !== identity) throw new Error('Approved marketplace source state changed.'); return next; });
      await service.invalidate(context.abortSignal); return { effect: 'saved', durability: 'confirmed', detail: `Marketplace ${action} saved; no fetching or code execution occurred.` };
    } });
    return { kind: 'local', output };
  } catch (error) { return { kind: 'local', output: `Marketplace refused: ${error instanceof Error ? error.message : 'operation could not be confirmed'}` }; }
}
