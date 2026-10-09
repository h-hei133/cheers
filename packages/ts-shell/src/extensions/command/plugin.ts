import { installOperation, removeOperation, rollbackOperation } from '../lifecycle/install.js';
import { activationOperation, migrationOperation, registrationOperation } from '../lifecycle/grants.js';
import type { ExtensionService } from '../service.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import { getInstalledPlugins } from '../../core/commands/plugin/store.js';
import { marketplaceCommand } from './marketplace.js';

export async function pluginCommand(args: string[], service: ExtensionService): Promise<LocalCommandResult> {
  try {
    service.check(); const [action = 'list', target, input, ...rest] = args;
    if (['list', 'ls'].includes(action) && !target) {
      const state = service.store.read(); const installed = state.packages.map(entry => `${entry.name}@${entry.active.manifest.version}; source ${entry.active.source}; SHA256 ${entry.active.digest}; ${entry.activation[service.root]?.enabled ? 'enabled' : 'disabled'}; grants ${entry.activation[service.root]?.grants.join(', ') || 'none'}`);
      return { kind: 'local', output: [...installed, ...state.imports.map(entry => `${entry.name}: unresolved legacy ${entry.spec}`), ...getInstalledPlugins().map(entry => `${entry.name}: legacy registration ${entry.spec}; unresolved for runtime; old flags grant no authority`), ...service.errors, ...service.store.outcomes.filter(entry => entry.durability === 'unknown').map(entry => `${entry.detail}; durability unknown`)].join('\n') || 'No extensions installed.' };
    }
    if (action === 'details' && target && !input) { const record = service.store.read().packages.find(entry => entry.name === target); if (!record) throw new Error('Extension is not installed.'); return { kind: 'local', output: JSON.stringify(record, null, 2) }; }
    if (action === 'reload' && !target) { await service.invalidate(); return { kind: 'local', output: service.errors.length ? service.errors.join('\n') : 'Extensions reloaded from current reviewed identities and workspace grants.' }; }
    if (action === 'cancel' && !target) { await service.cancel(); return { kind: 'local', output: service.errors.length ? service.errors.join('\n') : 'Extension calls cancelled and drained.' }; }
    if (action === 'run' && target && input) return { kind: 'local', output: await service.run(target, input, rest) };
    if (['search', 'find'].includes(action) && target && input) return marketplaceCommand(['search', target, input, ...rest], service);
    if (rest.length) throw new Error('Too many plugin arguments.');
    if (action === 'install' && target && !input) return { kind: 'local', output: await service.approve(await installOperation(service, target)) };
    if (action === 'add' && target && !input) return { kind: 'local', output: await service.approve(registrationOperation(service, target)) };
    if (action === 'update' && target && input) return { kind: 'local', output: await service.approve(await installOperation(service, input, target)) };
    if (action === 'rollback' && target && input) return { kind: 'local', output: await service.approve(rollbackOperation(service, target, input)) };
    if (['uninstall', 'remove', 'rm'].includes(action) && target && !input) return { kind: 'local', output: await service.approve(removeOperation(service, target)) };
    if (['enable', 'disable', 'grant', 'revoke'].includes(action) && target && (!input || ['grant', 'revoke'].includes(action))) return { kind: 'local', output: await service.approve(activationOperation(service, service.root, action as 'enable' | 'disable' | 'grant' | 'revoke', target, input), 'extension_grant') };
    if (action === 'migrate' && !target) return { kind: 'local', output: await service.approve(migrationOperation(service)) };
    throw new Error('Usage: /plugin list | details <name> | install <source>:<name>@<exactVersion> | update <name> <source>:<name>@<exactVersion> | rollback <name> <version> | uninstall <name> | enable|disable <name> | grant|revoke <name> prompt|script:<id>|command:<id>|tool:<id> | run <name> <script> [args] | reload | migrate');
  } catch (error) { return { kind: 'local', output: `Extension refused: ${error instanceof Error ? error.message : 'operation could not be confirmed'}` }; }
}
