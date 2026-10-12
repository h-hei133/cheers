import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { SkillLoader, type Skill } from '../../core/skills/skillLoader.js';
import { createCommandRegistry } from '../../core/commands/registry.js';
import { commandInvocations } from '../../core/commands/invocation.js';
import { createCoreToolRegistry } from '../../core/tools/registry.js';
import { versionPath } from '../store/state.js';
import { assertInventory } from '../archive/storage.js';
import { scriptArgs } from './execute.js';
import path from 'node:path';
import type { PackageRecord } from '../model.js';
import type { ToolDefinition } from '../../tools/types.js';
import type { CommandDefinition } from '../../core/commands/types.js';
import { SkillDiscovery } from '../../core/skills/discovery.js';

export interface RegistrationHost {
  readonly root: string;
  readonly sessionId: string;
  readonly file: string;
  readonly run: (tool: ToolDefinition, args: string[]) => Promise<string>;
  readonly current: (record: PackageRecord, grant: string) => void;
  readonly withheld: (name: string) => void;
  readonly tool: (record: PackageRecord, script: string, grant: string, name: string) => ToolDefinition;
}
export function extensionToolName(packageName: string, tool: string): string { return `ext_${packageName.replace(/-/g, '_')}_${tool}`; }
export function registerPackage(host: RegistrationHost, record: PackageRecord): () => void {
  const activation = record.activation[host.root]; if (!activation?.enabled) return () => {};
  assertInventory(versionPath(record.active, host.file), record.active);
  const manifest = record.active.manifest;
  const commands: CommandDefinition[] = []; const tools: ToolDefinition[] = [];
  const builtinNames = new Set([...createCommandRegistry(host.root).values()].flatMap(commandInvocations).map(entry => entry.name));
  builtinNames.add('back');
  for (const entry of manifest.commands) if (activation.grants.includes(`command:${entry.name}`) && activation.grants.includes(`script:${entry.script}`)) {
    if ([entry.name, ...entry.aliases ?? []].some(value => builtinNames.has(value) || value.startsWith('skill:'))) throw new Error('Extension command collides with a builtin.');
    const tool = host.tool(record, entry.script, `command:${entry.name}`, 'extension_run');
    commands.push({ name: entry.name, aliases: entry.aliases, description: entry.description, summary: entry.description,
      kind: 'local', group: 'workflow', supportsNonInteractive: true, execute: async (args, context) => {
        if (context.sessionId !== undefined && context.sessionId !== host.sessionId) return { kind: 'local', output: 'Extension command belongs to another session.' };
        return { kind: 'local', output: await host.run(tool, scriptArgs(args)) };
      } } as CommandDefinition);
  }
  const builtinTools = createCoreToolRegistry();
  for (const entry of manifest.tools) if (activation.grants.includes(`tool:${entry.name}`) && activation.grants.includes(`script:${entry.script}`)) {
    const selected = extensionToolName(manifest.name, entry.name); if (builtinTools.has(selected)) throw new Error('Extension tool collides with a builtin.');
    tools.push(host.tool(record, entry.script, `tool:${entry.name}`, selected));
  }
  let cached: readonly Skill[] | undefined;
  const skills = async (signal?: AbortSignal, discovery?: SkillDiscovery) => {
    if (!activation.grants.includes('prompt')) return [];
    const reader = discovery ?? new SkillDiscovery(signal);
    try {
      host.current(record, 'prompt');
      if (!cached) {
        const loaded = await new SkillLoader(host.root, { disableDiscovery: true, abortSignal: signal, discovery: reader,
          extraPaths: manifest.skills.map(entry => path.join(versionPath(record.active, host.file), entry.path)) }).loadDetailed();
        signal?.throwIfAborted(); host.current(record, 'prompt');
        if (loaded.failures.length || loaded.diagnostics.length || loaded.skills.size !== manifest.skills.length) throw new Error('Installed extension skill cannot be parsed.');
        cached = [...loaded.skills.values()].map(skill => ({ ...skill, source: 'extension' as const, isCurrent: () => { try { host.current(record, 'prompt'); return true; } catch { return false; } } }));
      } else reader.cached(cached.map(skill => [skill.name, skill.description, skill.body, skill.filePath, skill.source, ...skill.unhonouredFields]));
      signal?.throwIfAborted(); host.current(record, 'prompt');
      return cached;
    } catch (error) { reader.rethrow(error); host.withheld(record.name); return []; }
  };
  return registerCatalogContribution({ root: host.root, sessionId: host.sessionId, commands, tools, skills });
}
