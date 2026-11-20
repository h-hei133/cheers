import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { SkillLoader, type Skill } from '../../core/skills/skillLoader.js';
import { createCommandRegistry } from '../../core/commands/registry.js';
import { commandInvocations } from '../../core/commands/invocation.js';
import { createCoreToolRegistry } from '../../tools/registry.js';
import { versionPath } from '../store/state.js';
import { assertInventory } from '../archive/storage.js';
import { scriptArgs } from './execute.js';
import path from 'node:path';
import type { PackageRecord } from '../model.js';
import type { ToolDefinition } from '../../tools/types.js';
import type { CommandDefinition } from '../../core/commands/types.js';
import { SkillDiscovery } from '../../core/skills/discovery.js';
import { captureTreeResult, mergeTreeResult } from '../events/tree.js';
import { captureCompactResult, mergeCompactResult } from '../events/compact.js';
import { captureToolResult, reduceToolResult } from '../events/result.js';
import { captureMessageResult, projectMessageEnd } from '../events/message.js';
import type { ExtensionMessageEndEvent, ExtensionMessageEndResult } from '../events/model.js';
import type { ExtensionToolResult, ExtensionToolResultEvent } from '../events/model.js';
import { captureInputEvent, captureInputHookPayload, captureInputHookResult, captureInputResult, InputRefusal, projectInputEvent, reduceInputHookResult } from '../events/input.js';
import type { ExtensionBeforeCompactResult, ExtensionBeforeTreeResult, ExtensionInputEvent } from '../events/model.js';
import { callbackCancellation, captureCallbackResult } from '../../core/values/promise.js';
import type { HookDecision } from '../../core/hooks/types.js';
import { isNotificationEvent } from '../events/model.js';
import { isSessionTransitionEvent, sessionCancellation } from '../events/decision.js';

export interface RegistrationHost {
  readonly root: string;
  readonly sessionId: string;
  readonly file: string;
  readonly run: (tool: ToolDefinition, args: string[]) => Promise<string>;
  readonly current: (record: PackageRecord, grant: string) => void;
  readonly withheld: (name: string) => void;
  readonly tool: (record: PackageRecord, script: string, grant: string, name: string) => ToolDefinition;
  readonly event?: (record: PackageRecord, script: string, event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => Promise<unknown>;
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
  const jsScripts = manifest.scripts.filter(script => /\.(?:js|mjs|ts)$/.test(script.path) && activation.grants.includes(`script:${script.name}`));
  const onEvent = jsScripts.length && host.event
    ? async (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => {
        const nativeInput = event === 'input';
        const guardedInput = nativeInput || event === 'UserPromptSubmit';
        const compact = event === 'session_before_compact';
        const toolResult = event === 'tool_result';
        const messageEnd = event === 'message_end';
        const notification = isNotificationEvent(event);
        const transition = isSessionTransitionEvent(event);
        const captureResult = nativeInput ? captureInputResult : guardedInput ? captureInputHookResult
          : compact ? captureCompactResult : toolResult ? captureToolResult : messageEnd ? captureMessageResult
          : transition ? sessionCancellation : undefined;
        let currentPayload = nativeInput ? captureInputEvent(payload) : event === 'UserPromptSubmit' ? captureInputHookPayload(payload) : payload;
        let transformed = false;
        let hookResult: HookDecision | undefined;
        let treeResult: ExtensionBeforeTreeResult = { cancel: false };
        let compactResult: ExtensionBeforeCompactResult | undefined;
        let toolPatch: ExtensionToolResult | undefined;
        let messagePatch: ExtensionMessageEndResult | undefined;
        for (const script of jsScripts) {
          if (captureResult && signal) AbortSignal.prototype.throwIfAborted.call(signal);
          host.current(record, `script:${script.name}`);
          let next;
          try {
            next = captureResult ? (await captureCallbackResult<unknown>(
              () => host.event!(record, script.name, event, currentPayload, aliases, signal),
              captureResult, {
                check: () => { if (signal) AbortSignal.prototype.throwIfAborted.call(signal); host.current(record, `script:${script.name}`); },
                cancellation: callbackCancellation(signal),
                ...(guardedInput ? { invalid: () => new InputRefusal(), failed: () => new InputRefusal(), cancelled: () => new InputRefusal() } : {}),
              })).value
              : await host.event!(record, script.name, event, event === 'session_before_tree' ? payload : currentPayload, aliases, signal);
          }
          catch (error) {
            if (guardedInput) throw new InputRefusal();
            if (!toolResult && !notification) throw error;
            if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
            host.current(record, `script:${script.name}`);
            continue;
          }
          if (nativeInput) {
            if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
            host.current(record, `script:${script.name}`);
            const captured = captureInputResult(next);
            if (captured.action === 'handled') return captured;
            currentPayload = projectInputEvent(currentPayload as ExtensionInputEvent, captured);
            transformed ||= captured.action === 'transform';
            continue;
          }
          if (event === 'UserPromptSubmit') {
            const reduced = reduceInputHookResult(hookResult, next);
            hookResult = reduced.result;
            if (reduced.stop) return hookResult;
            continue;
          }
          if (event === 'session_before_tree') {
            treeResult = mergeTreeResult(treeResult, captureTreeResult(next));
            if (treeResult.cancel) return treeResult;
            continue;
          }
          if (compact) {
            compactResult = mergeCompactResult(compactResult, captureCompactResult(next));
            if (compactResult?.cancel) return compactResult;
            continue;
          }
          if (toolResult) {
            const reduced = reduceToolResult(currentPayload as ExtensionToolResultEvent, toolPatch, captureToolResult(next));
            currentPayload = reduced.event;
            toolPatch = reduced.result;
            continue;
          }
          if (messageEnd) {
            const nextMessage = captureMessageResult(next);
            const messageEvent = currentPayload as ExtensionMessageEndEvent;
            if (messageEvent.canReplace && nextMessage?.message) {
              currentPayload = projectMessageEnd(messageEvent, nextMessage);
              messagePatch = nextMessage;
            }
            continue;
          }
          if (notification) continue;
          if (transition) {
            if (next === true) return Object.freeze({ cancel: true });
            continue;
          }
          if (next !== undefined) currentPayload = next;
        }
        if (event === 'UserPromptSubmit') return hookResult;
        if (compact) return compactResult;
        if (toolResult) return toolPatch;
        if (messageEnd) return messagePatch;
        if (notification) return undefined;
        if (transition) return Object.freeze({ cancel: false });
        if (nativeInput) {
          const result = currentPayload as ExtensionInputEvent;
          return Object.freeze(transformed ? { action: 'transform', text: result.text, ...(result.images === undefined ? {} : { images: result.images }) }
            : { action: 'continue' });
        }
        return event === 'session_before_tree' ? treeResult : currentPayload;
      }
    : undefined;
  return registerCatalogContribution({ root: host.root, sessionId: host.sessionId, commands, tools, skills, ...(onEvent ? { onEvent } : {}) });
}
