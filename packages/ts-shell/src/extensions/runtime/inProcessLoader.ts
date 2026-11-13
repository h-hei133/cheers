import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { Worker } from 'node:worker_threads'
import ts from 'typescript'
import type { CommandDefinition } from '../../core/commands/types.js'
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import { redactReportText } from '../../core/security/redaction.js'
import { redactUnsafeReportText } from '../../core/security/reportText.js'
import type { DenyRule } from '../../core/shell/approval/deny.js'
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../tools/types.js'
import type { VersionRecord } from '../model.js'

export interface ExtensionAPI {
  readonly workspaceRoot: string
  registerTool(tool: ToolDefinition): void
  registerCommand(command: CommandDefinition): void
  on(event: string, handler: (payload: unknown) => unknown | Promise<unknown>): void
  readWorkspaceFile(relativePath: string): string
}

export interface LoadedInProcessExtension {
  readonly tools: readonly ToolDefinition[]
  readonly commands: readonly CommandDefinition[]
  readonly handlers: ReadonlyMap<string, readonly ((payload: unknown) => unknown | Promise<unknown>)[]>
  readonly readWorkspaceFile: (relativePath: string) => string
  readonly exports: Readonly<Record<string, unknown>>
}

export type InProcessExtensionInvoke =
  | { readonly kind: 'tool'; readonly name: string; readonly args?: Record<string, unknown> }
  | { readonly kind: 'command'; readonly name: string; readonly args?: readonly string[] }
  | { readonly kind: 'event'; readonly event: string; readonly payload?: unknown }

export const VIRTUAL_MODULES: Readonly<Record<string, Record<string, unknown>>> = Object.freeze({
  '@cheers/extension-api': Object.freeze({
    defineExtension: Object.setPrototypeOf((factory: (api: ExtensionAPI) => unknown) => factory, null),
  }),
})

function readContainedWorkspaceFile(
  workspaceRoot: string,
  relativePath: string,
  denyRules: () => readonly DenyRule[],
): string {
  const target = path.resolve(workspaceRoot, relativePath)
  const contained = verifyPathContainment(target, workspaceRoot)
  if (!contained.allowed) {
    throw new Error('Extension read target is outside the workspace.')
  }
  const decision = evaluateToolPermissionScope('read', { path: contained.resolvedPath }, 'ask', workspaceRoot, denyRules())
  if (decision.denied) {
    throw new Error(decision.reason)
  }
  return fs.readFileSync(contained.resolvedPath, 'utf8')
}

/**
 * Transpile `.ts` / `.mts` / `.mjs` / `.js` extension scripts to CommonJS so they
 * can execute safely across Linux, macOS, and Windows.
 */
export function transpileExtensionSource(source: string, filePath: string): string {
  const result = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      allowJs: true,
    },
  })
  return result.outputText
}

export function loadInProcessExtension(options: {
  readonly filePath: string
  readonly workspaceRoot: string
  readonly denyRules?: () => readonly DenyRule[]
}): LoadedInProcessExtension {
  const rawSource = fs.readFileSync(options.filePath, 'utf8')
  const code = transpileExtensionSource(rawSource, options.filePath)
  const tools: ToolDefinition[] = []
  const commands: CommandDefinition[] = []
  const handlers = new Map<string, ((payload: unknown) => unknown | Promise<unknown>)[]>()
  const denyRules = options.denyRules ?? (() => [])

  const safeRead = (relativePath: string) =>
    readContainedWorkspaceFile(options.workspaceRoot, String(relativePath ?? ''), denyRules)

  const api: ExtensionAPI = Object.freeze({
    workspaceRoot: options.workspaceRoot,
    registerTool: Object.setPrototypeOf((tool: ToolDefinition) => {
      tools.push(tool)
    }, null),
    registerCommand: Object.setPrototypeOf((command: CommandDefinition) => {
      commands.push(command)
    }, null),
    on: Object.setPrototypeOf((event: string, handler: (payload: unknown) => unknown | Promise<unknown>) => {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    }, null),
    readWorkspaceFile: Object.setPrototypeOf(safeRead, null),
  })

  const moduleExports: Record<string, unknown> = {}
  const moduleObj = { exports: moduleExports }
  const customRequire = Object.setPrototypeOf((specifier: string): unknown => {
    if (specifier in VIRTUAL_MODULES) {
      return VIRTUAL_MODULES[specifier]
    }
    throw new Error(`Extension module import '${specifier}' is not in VIRTUAL_MODULES.`)
  }, null)

  const sandbox = vm.createContext(
    {
      module: moduleObj,
      exports: moduleExports,
      require: customRequire,
      api,
    },
    {
      name: 'extension-in-process',
      codeGeneration: { strings: false, wasm: false },
    },
  )

  const script = new vm.Script(code, { filename: options.filePath })
  script.runInContext(sandbox, { timeout: 5_000 })

  const exported = moduleObj.exports as Record<string, unknown>
  const defaultExport = exported.default ?? exported.activate
  if (typeof defaultExport === 'function') {
    defaultExport(api)
  }

  return {
    tools,
    commands,
    handlers,
    readWorkspaceFile: safeRead,
    exports: exported,
  }
}

const EXTENSION_WORKER_SOURCE = `
const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');

const vmCtx = vm.createContext(Object.create(null), {
  name: 'extension-worker',
  codeGeneration: { strings: false, wasm: false },
});

const sendBridge = Object.setPrototypeOf((kind, jsonPayload) => {
  parentPort.postMessage({ kind: String(kind), json: String(jsonPayload ?? '') });
}, null);

let dispatchReply = null;
const registerReceiver = Object.setPrototypeOf((fn) => {
  dispatchReply = fn;
}, null);

Object.defineProperty(vmCtx, '__send', { value: sendBridge, enumerable: false });
Object.defineProperty(vmCtx, '__onReply', { value: registerReceiver, enumerable: false });
Object.defineProperty(vmCtx, '__ARGV', { value: JSON.stringify(workerData.argv), enumerable: false });
Object.defineProperty(vmCtx, '__ROOT', { value: String(workerData.workspaceRoot), enumerable: false });
Object.defineProperty(vmCtx, '__INVOKE', { value: workerData.invoke ? JSON.stringify(workerData.invoke) : '', enumerable: false });

const bootstrap = new vm.Script(\`
(() => {
  const send = globalThis.__send;
  const onReply = globalThis.__onReply;
  delete globalThis.__send;
  delete globalThis.__onReply;

  let seq = 0;
  const pending = new Map();
  onReply((id, ok, json) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(json === '' ? undefined : JSON.parse(json));
    else entry.reject(new Error(json || 'Extension host call failed.'));
  });

  function rpc(op, payload) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send('rpc', JSON.stringify({ id, op, payload }));
    });
  }

  globalThis.exports = {};
  globalThis.module = { exports: globalThis.exports };
  globalThis.require = (specifier) => {
    if (specifier === '@cheers/extension-api') {
      return { defineExtension: (factory) => factory };
    }
    throw new Error("Extension module import '" + specifier + "' is not in VIRTUAL_MODULES.");
  };
  const registeredTools = new Map();
  const registeredCommands = new Map();
  const registeredHandlers = new Map();
  globalThis.__registeredTools = registeredTools;
  globalThis.__registeredCommands = registeredCommands;
  globalThis.__registeredHandlers = registeredHandlers;

  globalThis.api = {
    workspaceRoot: globalThis.__ROOT,
    registerTool: (tool) => {
      if (!tool || typeof tool.name !== 'string' || !tool.name.trim() || typeof tool.execute !== 'function') {
        throw new Error('Extension registerTool requires { name, execute }.');
      }
      registeredTools.set(tool.name, tool);
      send('registerTool', JSON.stringify({
        name: tool.name,
        description: String(tool.description ?? ''),
        argsSchema: tool.argsSchema ?? { type: 'object' },
      }));
    },
    registerCommand: (cmd) => {
      if (!cmd || typeof cmd.name !== 'string' || !cmd.name.trim() || typeof cmd.execute !== 'function') {
        throw new Error('Extension registerCommand requires { name, execute }.');
      }
      registeredCommands.set(cmd.name, cmd);
      send('registerCommand', JSON.stringify({
        name: cmd.name,
        description: String(cmd.description ?? ''),
        aliases: Array.isArray(cmd.aliases) ? cmd.aliases.map(String) : [],
      }));
    },
    on: (event, handler) => {
      if (typeof event !== 'string' || !event.trim() || typeof handler !== 'function') {
        throw new Error('Extension on(event, handler) requires an event name and function.');
      }
      const list = registeredHandlers.get(event) ?? [];
      list.push(handler);
      registeredHandlers.set(event, list);
      send('registerEvent', JSON.stringify({ event }));
    },
    readWorkspaceFile: (rel) => rpc('readWorkspaceFile', { path: String(rel ?? '') }),
  };
})();
\`, { filename: 'extension-bootstrap.js' });

bootstrap.runInContext(vmCtx);

parentPort.on('message', (msg) => {
  if (msg && msg.kind === 'reply' && typeof dispatchReply === 'function') {
    dispatchReply(msg.id, msg.ok, msg.json);
  }
});

(async () => {
  try {
    const script = new vm.Script(workerData.code, { filename: workerData.filename });
    script.runInContext(vmCtx, { timeout: 5000 });
    const runner = new vm.Script(\`
      (async () => {
        const exp = module.exports || {};
        if (typeof exp.default === 'function') await exp.default(api);
        else if (typeof exp.activate === 'function') await exp.activate(api);
        const invoke = globalThis.__INVOKE ? JSON.parse(globalThis.__INVOKE) : null;
        if (invoke && invoke.kind === 'tool') {
          const tool = globalThis.__registeredTools.get(invoke.name);
          if (tool) return await tool.execute(invoke.args || {}, { workspaceRoot: globalThis.__ROOT });
        } else if (invoke && invoke.kind === 'command') {
          const cmd = globalThis.__registeredCommands.get(invoke.name);
          if (cmd) return await cmd.execute(invoke.args || [], { workspaceRoot: globalThis.__ROOT });
        } else if (invoke && invoke.kind === 'event') {
          const list = globalThis.__registeredHandlers.get(invoke.event) || [];
          let current = invoke.payload;
          for (const handler of list) {
            const next = await handler(current);
            if (next !== undefined) current = next;
          }
          return current;
        }
        if (typeof exp.run === 'function') {
          return await exp.run({ args: JSON.parse(globalThis.__ARGV), workspaceRoot: globalThis.__ROOT, api });
        }
        return 'Loaded extension successfully.';
      })()
    \`, { filename: 'extension-runner.js' });
    const value = await Promise.resolve(runner.runInContext(vmCtx, { timeout: 5000 }));
    if (value && typeof value === 'object' && typeof value.output === 'string' && typeof value.success === 'boolean') {
      parentPort.postMessage({ kind: value.success ? 'done' : 'error', json: value.output });
    } else {
      parentPort.postMessage({
        kind: 'done',
        json: typeof value === 'string' ? value : JSON.stringify(value ?? ''),
      });
    }
  } catch (err) {
    parentPort.postMessage({ kind: 'error', json: err instanceof Error ? err.message : String(err) });
  }
})();
`;

export async function executeInProcessScript(options: {
  readonly root: string
  readonly scriptFile: string
  readonly record: VersionRecord
  readonly argv: readonly string[]
  readonly denyRules: () => readonly DenyRule[]
  readonly context: ToolExecutionContext
  readonly invoke?: InProcessExtensionInvoke
}): Promise<ToolExecutionResult> {
  options.context.abortSignal?.throwIfAborted()
  const rawSource = fs.readFileSync(options.scriptFile, 'utf8')
  const code = transpileExtensionSource(rawSource, options.scriptFile)
  const timeoutMs = 30_000
  const registeredTools: Array<{ readonly name: string; readonly description: string }> = []
  const registeredCommands: Array<{ readonly name: string; readonly description: string; readonly aliases: readonly string[] }> = []
  const registeredEvents: string[] = []

  const worker = new Worker(EXTENSION_WORKER_SOURCE, {
    eval: true,
    env: {},
    resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
    workerData: {
      code,
      filename: options.scriptFile,
      argv: [...options.argv],
      workspaceRoot: options.root,
      ...(options.invoke ? { invoke: options.invoke } : {}),
    },
  })

  try {
    const outcome = await new Promise<{ readonly ok: boolean; readonly output: string }>((resolve) => {
      let settled = false
      const finish = (res: { readonly ok: boolean; readonly output: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.context.abortSignal?.removeEventListener('abort', onAbort)
        resolve(res)
      }
      const onAbort = () => {
        void worker.terminate()
        finish({ ok: false, output: 'Extension execution aborted.' })
      }
      const timer = setTimeout(() => {
        void worker.terminate()
        finish({ ok: false, output: `Extension execution timed out after ${timeoutMs}ms.` })
      }, timeoutMs)
      timer.unref?.()
      options.context.abortSignal?.addEventListener('abort', onAbort, { once: true })

      worker.on('message', (msg: { readonly kind: string; readonly json: string }) => {
        if (msg.kind === 'done') {
          finish({ ok: true, output: msg.json })
        } else if (msg.kind === 'error') {
          finish({ ok: false, output: msg.json })
        } else if (msg.kind === 'registerTool') {
          const info = JSON.parse(msg.json) as { name: string; description?: string }
          registeredTools.push({ name: info.name, description: String(info.description ?? '') })
        } else if (msg.kind === 'registerCommand') {
          const info = JSON.parse(msg.json) as { name: string; description?: string; aliases?: string[] }
          registeredCommands.push({
            name: info.name,
            description: String(info.description ?? ''),
            aliases: Array.isArray(info.aliases) ? info.aliases.map(String) : [],
          })
        } else if (msg.kind === 'registerEvent') {
          const info = JSON.parse(msg.json) as { event: string }
          if (!registeredEvents.includes(info.event)) registeredEvents.push(info.event)
        } else if (msg.kind === 'rpc') {
          const parsed = JSON.parse(msg.json) as { id: number; op: string; payload: { path?: string } }
          try {
            if (parsed.op !== 'readWorkspaceFile') {
              throw new Error(`Unsupported extension host op: ${parsed.op}`)
            }
            const content = readContainedWorkspaceFile(options.root, String(parsed.payload.path ?? ''), options.denyRules)
            if (!settled) worker.postMessage({ kind: 'reply', id: parsed.id, ok: true, json: JSON.stringify(content) })
          } catch (err) {
            if (!settled) {
              worker.postMessage({
                kind: 'reply',
                id: parsed.id,
                ok: false,
                json: err instanceof Error ? err.message : String(err),
              })
            }
          }
        }
      })
      worker.on('error', err => finish({ ok: false, output: err instanceof Error ? err.message : String(err) }))
      worker.on('exit', codeExit => {
        if (!settled) finish({ ok: false, output: `Extension worker exited unexpectedly (${codeExit}).` })
      })
    })

    const detail = redactUnsafeReportText(
      redactReportText(outcome.output, 16_000, { projectRoot: options.root }),
      new Set(),
      16_000,
    )
    return {
      success: outcome.ok,
      output: `${detail}\nExtension execution: ${outcome.ok ? 'completed' : 'failed'}; exit ${outcome.ok ? 0 : 1}; mode in-process; source ${options.record.source}; SHA256 ${options.record.digest}.`,
      metadata: {
        extension: options.record.manifest.name,
        source: options.record.source,
        version: options.record.manifest.version,
        digest: options.record.digest,
        cleanup: 'confirmed',
        registeredTools,
        registeredCommands,
        registeredEvents,
      },
    }
  } finally {
    await worker.terminate().catch(() => {})
  }
}
