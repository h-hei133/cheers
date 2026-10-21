import { ExtensionStore, versionPath } from './store/state.js';
import { assertInventory } from './archive/storage.js';
import { readSources, sourceIdentity, selectedSource } from './registry/sources.js';
import { canonical } from './registry/validation.js';
import { rootIdentity, rootSignature } from './lifecycle/grants.js';
import { registerPackage } from './runtime/registration.js';
import { executeScript, scriptArgs, type ExecutionHost } from './runtime/execute.js';
import { runPreparedTool } from '../turn/invoke.js';
import type { ToolGateOptions } from '../turn/tools.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import type { PackageRecord, EffectOutcome } from './model.js';
import type { Operation, LifecycleHost } from './lifecycle/install.js';
import type { DenyRule } from '../core/shell/approval/deny.js';
import { observeDirectory } from '../core/state/watch.js';
import { sourceFile } from './registry/sources.js';
import { ExtensionCalls } from './runtime/calls.js';
import { evaluateToolPermissionScope } from '../core/query/toolPolicy.js';

export interface ExtensionServiceOptions {
  readonly root: string;
  readonly store?: ExtensionStore;
  readonly gate: (tool: string) => ToolGateOptions;
  readonly check: () => void;
  readonly offline: () => boolean;
  readonly denyRules: () => readonly DenyRule[];
  readonly execution?: ExecutionHost['execution'];
  readonly assertWorkspace: (write: boolean) => void;
  readonly assertSourceAccess?: (absolute: string) => void;
}
export class ExtensionService implements LifecycleHost {
  readonly store: ExtensionStore;
  readonly root: string;
  readonly sessionId: string;
  readonly check: () => void;
  readonly offline: () => boolean;
  readonly errors: string[] = [];
  private epoch = 0;
  private closed = false;
  private drainUnknown = false;
  private processCleanupUnknown = false;
  private registrations: Array<() => void> = [];
  private readonly calls = new ExtensionCalls();
  private watchers: Array<() => void> = [];
  private publication = '';
  constructor(readonly options: ExtensionServiceOptions) {
    this.store = options.store ?? new ExtensionStore(); this.root = rootIdentity(options.root); this.sessionId = options.gate('extension_manage').sessionId;
    const workspaceIdentity = rootSignature(this.root);
    this.check = () => { options.check(); if (this.closed || this.drainUnknown) throw new Error('Extension runtime is closed or process drainage is unknown.'); if (rootIdentity(options.root) !== this.root || rootSignature(this.root) !== workspaceIdentity) throw new Error('Extension workspace identity changed.'); };
    this.offline = options.offline;
    this.activate();
    this.watchers = [this.store.file, sourceFile()].map(file => observeDirectory(file, () => { if (this.snapshot() !== this.publication) void this.invalidate().catch(() => {}); }));
  }
  private snapshot(): string { try { return canonical({ state: this.store.read(), sources: readSources() }); } catch { return 'invalid'; } }
  current(record: PackageRecord, grant: string, epoch = this.epoch): void {
    this.check(); if (epoch !== this.epoch || this.store.outcomes.some(value => value.durability === 'unknown')) throw new Error('Extension capability has been revoked or publication is uncertain.');
    const current = this.store.read().packages.find(entry => entry.name === record.name); const activation = current?.activation[this.root];
    if (!current || canonical(current.active) !== canonical(record.active) || !activation?.enabled || activation.workspaceIdentity !== rootSignature(this.root) || !activation.grants.includes(grant)) throw new Error('Extension capability grant is absent or stale.');
    if (sourceIdentity(selectedSource(record.active.source)) !== record.active.sourceIdentity) throw new Error('Extension source trust identity changed.');
    assertInventory(versionPath(current.active, this.store.file), current.active);
  }
  private activate(): void {
    this.publication = this.snapshot();
    const epoch = this.epoch;
    this.errors.length = 0;
    try {
      this.check(); if (this.store.outcomes.some(value => value.durability === 'unknown')) throw new Error('Extension durability is unknown; capabilities withheld.');
      for (const record of this.store.read().packages) {
        try {
          const activation = record.activation[this.root];
          if (activation?.enabled && (activation.workspaceIdentity !== rootSignature(this.root) || sourceIdentity(selectedSource(record.active.source)) !== record.active.sourceIdentity)) throw new Error('Extension activation identity changed.');
          this.registrations.push(registerPackage({ root: this.root, sessionId: this.sessionId, file: this.store.file, run: (tool, args) => this.runTool(tool, args),
          withheld: name => { const message = `${name}: prompt contribution withheld because its identity, grants, files or parsing are invalid.`; if (!this.errors.includes(message)) this.errors.push(message); },
          current: (selected, grant) => this.current(selected, grant, epoch), tool: (selected, script, grant, name) => this.tool(selected, script, grant, name) }, record)); }
        catch { this.errors.push(`${record.name}: registration withheld because its identity, permissions, files or capability names are invalid.`); }
      }
    } catch { this.errors.push('Extension state unavailable; all capabilities withheld.'); }
  }
  async invalidate(except?: AbortSignal): Promise<void> {
    const revision = ++this.epoch; this.registrations.splice(0).forEach(unregister => unregister());
    await this.cancel(except); if (revision === this.epoch && !this.closed && !this.drainUnknown) this.activate();
  }
  async cancel(except?: AbortSignal): Promise<void> {
    if (!await this.calls.cancel(except)) { this.drainUnknown = true; this.errors.push('Extension calls did not drain within their bound; cleanup remains unknown.'); }
  }
  request<T>(action: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    return this.calls.run(async signal => { this.check(); if (this.snapshot() !== this.publication) await this.invalidate(signal); signal.throwIfAborted(); const result = await action(signal); signal.throwIfAborted(); this.check(); return result; }, signal);
  }
  assertSourceAccess(absolute: string): void {
    this.check(); const decision = evaluateToolPermissionScope('read', { path: absolute }, 'ask', this.root, this.options.denyRules());
    if (decision.denied) throw new Error(decision.reason);
    if (!this.options.assertSourceAccess) throw new Error('Extension public-key source access is unavailable.'); this.options.assertSourceAccess(absolute);
  }
  async close(): Promise<void> {
    this.closed = true; this.watchers.splice(0).forEach(close => close()); this.epoch++;
    this.registrations.splice(0).forEach(close => close());
    if (!await this.calls.cancel() || this.processCleanupUnknown) throw new Error('Extension cleanup remains unknown; runtime reentry is blocked.');
  }
  tool(record: PackageRecord, script: string, grant: string, selected = 'extension_run'): ToolDefinition {
    const epoch = this.epoch;
    const declared = record.active.manifest.tools.find(entry => grant === `tool:${entry.name}`)?.description;
    return { name: selected, description: `${declared ? `${declared}\n` : ''}Run ${record.name} declared capability ${grant} in its OS sandbox; requires separate grants and ordinary approval.`,
      resultAdmission: () => { try { this.current(record, grant, epoch); this.current(record, `script:${script}`, epoch); this.options.assertWorkspace(record.active.manifest.permissions.workspace === 'write'); const blocked = this.options.gate(selected).admission?.() ?? this.options.gate('bash').admission?.(); if (blocked) throw new Error(blocked); return undefined; } catch { return 'Extension execution authority changed after ordinary hooks.'; } },
      argsSchema: { type: 'object', properties: { args: { type: 'array', items: { type: 'string', maxLength: 1024 }, maxItems: 32 } }, additionalProperties: false },
      prepare: (args, context) => {
        if (context.sessionId !== undefined && context.sessionId !== this.sessionId) throw new Error('Extension tool belongs to another session.');
        const argv = scriptArgs(args.args); this.current(record, grant, epoch); this.current(record, `script:${script}`, epoch); this.options.assertWorkspace(record.active.manifest.permissions.workspace === 'write');
        const native = this.options.gate('bash').admission?.(); if (native) throw new Error(native);
        return { targets: [], previewKind: 'execution', permissionToolName: 'bash', permissionArgs: { command: `extension:${record.active.source}:${record.name}@${record.active.manifest.version}:${record.active.digest}:${script} ${JSON.stringify(argv)}` },
          preview: `Execute isolated /bin/sh script ${script}\nSource ${record.active.source}; version ${record.active.manifest.version}; SHA256 ${record.active.digest}\nWorkspace ${this.root}; declared ${canonical(record.active.manifest.permissions)}; args ${JSON.stringify(argv)}`,
          execute: context => this.invoke(record, script, grant, argv, epoch, context) };
      }, execute: async () => { throw new Error('Extension execution requires its original prepared and approved call.'); } };
  }
  private async invoke(record: PackageRecord, script: string, grant: string, args: string[], epoch: number, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    if (context.sessionId !== undefined && context.sessionId !== this.sessionId) throw new Error('Extension execution belongs to another session.');
    const current = () => { this.current(record, grant, epoch); this.current(record, `script:${script}`, epoch); this.options.assertWorkspace(record.active.manifest.permissions.workspace === 'write'); const blocked = this.options.gate('bash').admission?.(); if (blocked) throw new Error(blocked); };
    current();
    return this.calls.run(async signal => {
      const result = await executeScript({ file: this.store.file, root: this.root, check: this.check, denyRules: this.options.denyRules, execution: this.options.execution }, record.active, script, args, current, { ...context, abortSignal: signal });
      if (result.metadata?.cleanup === 'unknown') { this.drainUnknown = true; this.processCleanupUnknown = true; this.epoch++; this.registrations.splice(0).forEach(unregister => unregister()); this.errors.push('Extension process or runtime-home cleanup is unknown; capabilities withheld.'); }
      try { current(); } catch { return { ...result, success: false, output: `${result.output}\nExtension authority changed after execution; actual receipt remains visible.` }; } return result;
    }, context.abortSignal);
  }
  async approve(operation: Operation, selected: 'extension_manage' | 'extension_grant' = 'extension_manage', signal?: AbortSignal): Promise<string> {
    this.check(); return this.calls.run(async signal => {
    const gate = this.options.gate(selected); const admission = () => { if (signal.aborted) return 'Extension operation cancelled.'; try { this.check(); return gate.admission?.(); } catch { return 'Extension lifecycle authority changed.'; } };
    const tool: ToolDefinition = { name: selected, description: 'Apply the exact reviewed extension lifecycle operation.', argsSchema: { type: 'object' },
      resultAdmission: admission,
      prepare: () => ({ targets: [], permissionArgs: { operation: selected }, previewKind: 'execution', preview: operation.preview,
        execute: async context => {
          this.check(); const effect: EffectOutcome = await operation.apply(context);
          // Cleanup can become uncertain after a confirmed registry publication.
          // Retain that actual result alongside uncertain saves, so reopening a
          // view or command cannot offer a fresh mutation in the same runtime.
          if (effect.durability === 'unknown' && !this.store.outcomes.some(entry => canonical(entry) === canonical(effect))) this.store.outcomes.push(effect);
          return { success: effect.durability === 'confirmed', output: `${effect.detail}\nEffect: ${effect.effect}; durability: ${effect.durability}.`, metadata: { effect } };
        } }),
      execute: async () => { throw new Error('Extension lifecycle requires its original prepared and approved call.'); } };
    return (await runPreparedTool(tool, {}, { ...gate, admission, permissionScope: 'ask' }, signal, undefined, 'Extension operation')).output;
    }, signal);
  }
  async run(packageName: string, script: string, args: string[]): Promise<string> {
    const record = this.store.read().packages.find(entry => entry.name === packageName); if (!record) throw new Error('Extension is not installed.');
    const tool = this.tool(record, script, `script:${script}`);
    return this.runTool(tool, args);
  }
  private runTool(tool: ToolDefinition, args: string[]): Promise<string> {
    return this.calls.run(async signal => {
      const gate = this.options.gate(tool.name);
      const admission = () => { if (signal.aborted) return 'Extension execution cancelled.'; try { this.check(); return gate.admission?.(); } catch { return 'Extension execution authority changed.'; } };
      return (await runPreparedTool(tool, { args }, { ...gate, admission, permissionScope: 'ask' }, signal, undefined, 'Extension execution')).output;
    });
  }
}
