import { prepareInstallPlan, removeOperation, rollbackOperation } from '../lifecycle/install.js';
import { activationOperation, migrationOperation, registrationOperation } from '../lifecycle/grants.js';
import type { ExtensionService } from '../service.js';
import type { LocalCommandResult } from '../../core/commands/types.js';
import { getInstalledPlugins } from '../../core/commands/plugin/store.js';
import { marketplaceCommand } from './marketplace.js';
import path from 'node:path';
import { readPackageManifest } from '../registry/manifest.js';
import { manifestForInspection } from '../registry/validation.js';
import type { VersionRecord } from '../model.js';
import { verifyPathContainment } from '../../core/security/pathJail.js';
import { isRecord } from '../../core/values/record.js';

export interface PluginCommandResult extends LocalCommandResult { readonly installConfirmed?: boolean }

export function isExtensionControl(text: string): boolean {
  return /^\/(?:plugin|plugins|extensions)(?:\s+(?:cancel|list|details|disable|revoke|reload)(?:\s|$)|\s*$)|^\/reload-plugins(?:\s|$)/i.test(text.trim());
}

export async function pluginCommand(args: string[], service: ExtensionService,
  options: { readonly signal?: AbortSignal; readonly explicitApproval?: boolean } = {}): Promise<PluginCommandResult> {
  try {
    service.check(); const [action = 'list', target, input, ...rest] = args;
    if (['list', 'ls'].includes(action) && !target) {
      const state = service.store.read(); const installed = state.packages.map(entry => `${entry.name}@${entry.active.manifest.version}; source ${entry.active.source}; SHA256 ${entry.active.digest}; ${entry.activation[service.root]?.enabled ? 'enabled' : 'disabled'}; grants ${entry.activation[service.root]?.grants.join(', ') || 'none'}`);
      return { kind: 'local', output: [...installed, ...state.imports.map(entry => `${entry.name}: unresolved legacy ${entry.spec}`), ...getInstalledPlugins().map(entry => `${entry.name}: legacy registration ${entry.spec}; unresolved for runtime; old flags grant no authority`), ...service.errors, ...service.store.outcomes.filter(entry => entry.durability === 'unknown').map(entry => `${entry.detail}; durability unknown`)].join('\n') || 'No extensions installed.' };
    }
    if (action === 'details' && target && !input) {
      const record = service.store.read().packages.find(entry => entry.name === target);
      if (!record) throw new Error('Extension is not installed.');
      const inspect = (version: VersionRecord) => ({ ...version, manifest: manifestForInspection(version.manifest) });
      return { kind: 'local', output: JSON.stringify({ ...record, active: inspect(record.active), history: record.history.map(inspect) }, null, 2) };
    }
    if (action === 'reload' && !target) { await service.invalidate(); return { kind: 'local', output: service.errors.length ? service.errors.join('\n') : 'Extensions reloaded from current reviewed identities and workspace grants.' }; }
    if (action === 'cancel' && !target) { await service.cancel(); return { kind: 'local', output: service.errors.length ? service.errors.join('\n') : 'Extension calls cancelled and drained.' }; }
    if (action === 'run' && target && input) return { kind: 'local', output: await service.run(target, input, rest) };
    if (['search', 'find'].includes(action) && target && input) return marketplaceCommand(['search', target, input, ...rest], service);
    if (action === 'local' && target && !input) {
      const candidate = path.resolve(service.root, target);
      const containment = verifyPathContainment(candidate, service.root);
      if (!containment.allowed) throw new Error('Local extension inspection target must stay within the workspace.');
      service.assertSourceAccess(containment.resolvedPath);
      service.assertSourceAccess(path.join(containment.resolvedPath, 'package.json'));
      const discovered = readPackageManifest(containment.resolvedPath);
      return { kind: 'local', output: JSON.stringify(discovered, null, 2) };
    }
    if (rest.length) throw new Error('Too many plugin arguments.');
    if (target && (action === 'install' && !input || action === 'update' && input)) {
      const plan = await prepareInstallPlan(service, action === 'update' ? input! : target, action === 'update' ? target : undefined, options.signal);
      if (plan.acquisition) {
        const acquisition = await service.approveResult(plan.acquisition, 'extension_manage', options.signal);
        if (acquisition.isError) return { kind: 'local', output: acquisition.output, ...(action === 'install' ? { installConfirmed: false } : {}) };
      }
      const result = await service.approveResult(plan.complete(), 'extension_manage', options.signal, options.explicitApproval);
      const effect = result.metadata?.effect;
      const installConfirmed = !result.isError && isRecord(effect) && effect.effect === 'published' && effect.durability === 'confirmed';
      return { kind: 'local', output: result.output, ...(action === 'install' ? { installConfirmed } : {}) };
    }
    if (action === 'add' && target && !input) return { kind: 'local', output: await service.approve(registrationOperation(service, target)) };
    if (action === 'rollback' && target && input) return { kind: 'local', output: await service.approve(rollbackOperation(service, target, input)) };
    if (['uninstall', 'remove', 'rm'].includes(action) && target && !input) return { kind: 'local', output: await service.approve(removeOperation(service, target)) };
    if (['enable', 'disable', 'grant', 'revoke'].includes(action) && target && (!input || ['grant', 'revoke'].includes(action))) return { kind: 'local', output: await service.approve(activationOperation(service, service.root, action as 'enable' | 'disable' | 'grant' | 'revoke', target, input), 'extension_grant') };
    if (action === 'migrate' && !target) return { kind: 'local', output: await service.approve(migrationOperation(service)) };
    throw new Error('Usage: /plugin list | details <name> | local <dir> | install <source> | update <name> <source> | rollback <name> <version-or-sha256> | uninstall <name> | enable|disable <name> | grant|revoke <name> prompt|script:<id>|command:<id>|tool:<id>|mcp:<id>|provider:<id>|renderer:<type> | run <name> <script> [args] | reload | migrate. Sources: source:name@version, npm:name@version, git:https://github.com/OWNER/REPO#COMMIT, or ./package.');
  } catch (error) { return { kind: 'local', output: `Extension refused: ${error instanceof Error ? error.message : 'operation could not be confirmed'}` }; }
}
