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
import { EXTENSION_WORKER_SOURCE } from './workerSource.js'

export interface ExtensionUiDialogOptions {
  readonly timeout?: number
}

export interface ExtensionUiHost {
  readonly select?: (title: string, options: readonly string[], opts?: ExtensionUiDialogOptions) => Promise<string | undefined>
  readonly confirm?: (title: string, message: string, opts?: ExtensionUiDialogOptions) => Promise<boolean>
  readonly input?: (title: string, placeholder?: string, opts?: ExtensionUiDialogOptions) => Promise<string | undefined>
  readonly editor?: (title: string, prefill?: string) => Promise<string | undefined>
  readonly notify?: (message: string, notifyType?: 'info' | 'warning' | 'error') => void
  readonly setStatus?: (statusKey: string, statusText: string | undefined) => void
  readonly setWidget?: (widgetKey: string, widgetLines: readonly string[] | undefined, widgetPlacement?: 'aboveEditor' | 'belowEditor') => void
  readonly setTitle?: (title: string) => void
  readonly setEditorText?: (text: string) => void
}

export interface ExtensionHostBridge {
  readonly ui?: ExtensionUiHost
  readonly getActiveTools?: () => readonly string[]
  readonly getAllTools?: () => readonly string[]
  readonly getCommands?: () => readonly string[]
  readonly sendMessage?: (message: unknown) => Promise<void> | void
  readonly appendEntry?: (customType: string, data: unknown) => Promise<void> | void
}

export interface ExtensionShortcut {
  readonly key: string
  readonly description?: string
  readonly run?: () => unknown | Promise<unknown>
}

export interface ExtensionFlag {
  readonly name: string
  readonly description?: string
  readonly type?: 'string' | 'boolean'
  readonly default?: string | boolean
}

export interface ExtensionEventBus {
  on(channel: string, listener: (data: unknown) => unknown): () => void
  once(channel: string, listener: (data: unknown) => unknown): () => void
  off(channel: string, listener: (data: unknown) => unknown): void
  emit(channel: string, data?: unknown): void
}

export interface ExtensionAPI {
  readonly workspaceRoot: string
  readonly events: ExtensionEventBus
  readonly ui: Required<ExtensionUiHost>
  registerTool(tool: ToolDefinition): void
  registerCommand(command: CommandDefinition): void
  registerShortcut(shortcut: ExtensionShortcut): void
  registerFlag(flag: ExtensionFlag): void
  getFlag(name: string): string | boolean | undefined
  on(event: string, handler: (payload: unknown) => unknown | Promise<unknown>): void
  readWorkspaceFile(relativePath: string): string | Promise<string>
  getActiveTools(): Promise<readonly string[]>
  getAllTools(): Promise<readonly string[]>
  getCommands(): Promise<readonly string[]>
  sendMessage(message: unknown): Promise<void>
  appendEntry(customType: string, data: unknown): Promise<void>
}

export interface LoadedInProcessExtension {
  readonly tools: readonly ToolDefinition[]
  readonly commands: readonly CommandDefinition[]
  readonly shortcuts: readonly ExtensionShortcut[]
  readonly flags: readonly ExtensionFlag[]
  readonly handlers: ReadonlyMap<string, readonly ((payload: unknown) => unknown | Promise<unknown>)[]>
  readonly events: ExtensionEventBus
  readonly readWorkspaceFile: (relativePath: string) => string
  readonly exports: Readonly<Record<string, unknown>>
}

export type InProcessExtensionInvoke =
  | { readonly kind: 'tool'; readonly name: string; readonly args?: Record<string, unknown> }
  | { readonly kind: 'command'; readonly name: string; readonly args?: readonly string[] }
  | { readonly kind: 'event'; readonly event: string; readonly aliases?: readonly string[]; readonly payload?: unknown }

export const VIRTUAL_MODULES: Readonly<Record<string, Record<string, unknown>>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, Record<string, unknown>>, {
    '@cheers/extension-api': Object.freeze(
      Object.assign(Object.create(null) as Record<string, unknown>, {
        defineExtension: Object.setPrototypeOf((factory: (api: ExtensionAPI) => unknown) => factory, null),
      }),
    ),
  }),
)

function readContainedWorkspaceFile(workspaceRoot: string, relativePath: string, denyRules: () => readonly DenyRule[]): string {
  const target = path.resolve(workspaceRoot, relativePath)
  const contained = verifyPathContainment(target, workspaceRoot)
  if (!contained.allowed) throw new Error('Extension read target is outside the workspace.')
  const decision = evaluateToolPermissionScope('read', { path: contained.resolvedPath }, 'ask', workspaceRoot, denyRules())
  if (decision.denied) throw new Error(decision.reason)
  return fs.readFileSync(contained.resolvedPath, 'utf8')
}

function nullProtoFn<T extends (...args: never[]) => unknown>(fn: T): T {
  return Object.setPrototypeOf(fn, null)
}

function createEventBus(): ExtensionEventBus {
  const listeners = new Map<string, Set<(data: unknown) => unknown>>()
  const bus: ExtensionEventBus = Object.assign(Object.create(null) as ExtensionEventBus, {
    on: nullProtoFn((channel: string, listener: (data: unknown) => unknown) => {
      const set = listeners.get(channel) ?? new Set()
      set.add(listener)
      listeners.set(channel, set)
      return nullProtoFn(() => set.delete(listener))
    }),
    once: nullProtoFn((channel: string, listener: (data: unknown) => unknown) => {
      const off = bus.on(channel, data => {
        off()
        return listener(data)
      })
      return off
    }),
    off: nullProtoFn((channel: string, listener: (data: unknown) => unknown) => {
      listeners.get(channel)?.delete(listener)
    }),
    emit: nullProtoFn((channel: string, data?: unknown) => {
      for (const fn of [...(listeners.get(channel) ?? [])]) fn(data)
    }),
  })
  return Object.freeze(bus)
}

function resolveUiHost(ui?: ExtensionUiHost): Required<ExtensionUiHost> {
  return Object.freeze(Object.assign(Object.create(null) as Required<ExtensionUiHost>, {
    select: nullProtoFn((title: string, opts: readonly string[], dialogOpts?: ExtensionUiDialogOptions) =>
      ui?.select ? ui.select(title, opts, dialogOpts) : Promise.resolve(undefined)),
    confirm: nullProtoFn((title: string, message: string, dialogOpts?: ExtensionUiDialogOptions) =>
      ui?.confirm ? ui.confirm(title, message, dialogOpts) : Promise.resolve(false)),
    input: nullProtoFn((title: string, placeholder?: string, dialogOpts?: ExtensionUiDialogOptions) =>
      ui?.input ? ui.input(title, placeholder, dialogOpts) : Promise.resolve(undefined)),
    editor: nullProtoFn((title: string, prefill?: string) =>
      ui?.editor ? ui.editor(title, prefill) : Promise.resolve(undefined)),
    notify: nullProtoFn((message: string, notifyType?: 'info' | 'warning' | 'error') => ui?.notify?.(message, notifyType)),
    setStatus: nullProtoFn((statusKey: string, statusText: string | undefined) => ui?.setStatus?.(statusKey, statusText)),
    setWidget: nullProtoFn((widgetKey: string, widgetLines: readonly string[] | undefined, placement?: 'aboveEditor' | 'belowEditor') =>
      ui?.setWidget?.(widgetKey, widgetLines, placement)),
    setTitle: nullProtoFn((title: string) => ui?.setTitle?.(title)),
    setEditorText: nullProtoFn((text: string) => ui?.setEditorText?.(text)),
  }))
}

async function handleWorkerHostRpc(
  op: string,
  payload: Record<string, unknown>,
  options: { readonly root: string; readonly denyRules: () => readonly DenyRule[]; readonly host?: ExtensionHostBridge },
): Promise<unknown> {
  const ui = resolveUiHost(options.host?.ui)
  switch (op) {
    case 'readWorkspaceFile':
      return readContainedWorkspaceFile(options.root, String(payload.path ?? ''), options.denyRules)
    case 'ui.select':
      return ui.select(String(payload.title ?? ''), Array.isArray(payload.options) ? payload.options.map(String) : [], { timeout: typeof payload.timeout === 'number' ? payload.timeout : undefined })
    case 'ui.confirm':
      return ui.confirm(String(payload.title ?? ''), String(payload.message ?? ''), { timeout: typeof payload.timeout === 'number' ? payload.timeout : undefined })
    case 'ui.input':
      return ui.input(String(payload.title ?? ''), typeof payload.placeholder === 'string' ? payload.placeholder : undefined, { timeout: typeof payload.timeout === 'number' ? payload.timeout : undefined })
    case 'ui.editor':
      return ui.editor(String(payload.title ?? ''), typeof payload.prefill === 'string' ? payload.prefill : undefined)
    case 'ui.notify':
      ui.notify(String(payload.message ?? ''), payload.notifyType as 'info' | 'warning' | 'error' | undefined)
      return undefined
    case 'ui.setStatus':
      ui.setStatus(String(payload.statusKey ?? ''), typeof payload.statusText === 'string' ? payload.statusText : undefined)
      return undefined
    case 'ui.setWidget':
      ui.setWidget(String(payload.widgetKey ?? ''), Array.isArray(payload.widgetLines) ? payload.widgetLines.map(String) : undefined, payload.widgetPlacement as 'aboveEditor' | 'belowEditor' | undefined)
      return undefined
    case 'ui.setTitle':
      ui.setTitle(String(payload.title ?? ''))
      return undefined
    case 'ui.setEditorText':
      ui.setEditorText(String(payload.text ?? ''))
      return undefined
    case 'host.getActiveTools':
      return options.host?.getActiveTools ? options.host.getActiveTools() : []
    case 'host.getAllTools':
      return options.host?.getAllTools ? options.host.getAllTools() : []
    case 'host.getCommands':
      return options.host?.getCommands ? options.host.getCommands() : []
    case 'host.sendMessage':
      await options.host?.sendMessage?.(payload.msg)
      return undefined
    case 'host.appendEntry':
      await options.host?.appendEntry?.(String(payload.customType ?? ''), payload.data)
      return undefined
    default:
      throw new Error(`Unsupported extension host op: ${op}`)
  }
}

/** Transpile `.ts` / `.mts` / `.mjs` / `.js` extension scripts to CommonJS across all platforms. */
export function transpileExtensionSource(source: string, filePath: string): string {
  return ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, allowJs: true },
  }).outputText
}

export function loadInProcessExtension(options: {
  readonly filePath: string
  readonly workspaceRoot: string
  readonly denyRules?: () => readonly DenyRule[]
  readonly host?: ExtensionHostBridge
}): LoadedInProcessExtension {
  const rawSource = fs.readFileSync(options.filePath, 'utf8')
  const code = transpileExtensionSource(rawSource, options.filePath)
  const tools: ToolDefinition[] = []
  const commands: CommandDefinition[] = []
  const shortcuts: ExtensionShortcut[] = []
  const flags: ExtensionFlag[] = []
  const flagValues = new Map<string, string | boolean | undefined>()
  const handlers = new Map<string, ((payload: unknown) => unknown | Promise<unknown>)[]>()
  const denyRules = options.denyRules ?? (() => [])
  const safeRead = (relativePath: string) => readContainedWorkspaceFile(options.workspaceRoot, String(relativePath ?? ''), denyRules)
  const events = createEventBus()
  const ui = resolveUiHost(options.host?.ui)

  const api: ExtensionAPI = Object.freeze(Object.assign(Object.create(null) as ExtensionAPI, {
    workspaceRoot: options.workspaceRoot,
    events,
    ui,
    registerTool: nullProtoFn((tool: ToolDefinition) => tools.push(tool)),
    registerCommand: nullProtoFn((command: CommandDefinition) => commands.push(command)),
    registerShortcut: nullProtoFn((shortcut: ExtensionShortcut) => shortcuts.push(shortcut)),
    registerFlag: nullProtoFn((flag: ExtensionFlag) => {
      flags.push(flag)
      if (!flagValues.has(flag.name) && flag.default !== undefined) flagValues.set(flag.name, flag.default)
    }),
    getFlag: nullProtoFn((name: string) => flagValues.get(name)),
    on: nullProtoFn((event: string, handler: (payload: unknown) => unknown | Promise<unknown>) => {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    }),
    readWorkspaceFile: nullProtoFn(safeRead),
    getActiveTools: nullProtoFn(async () => options.host?.getActiveTools?.() ?? []),
    getAllTools: nullProtoFn(async () => options.host?.getAllTools?.() ?? []),
    getCommands: nullProtoFn(async () => options.host?.getCommands?.() ?? []),
    sendMessage: nullProtoFn(async (msg: unknown) => { await options.host?.sendMessage?.(msg) }),
    appendEntry: nullProtoFn(async (customType: string, data: unknown) => { await options.host?.appendEntry?.(customType, data) }),
  }))

  const moduleExports: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  const moduleObj = Object.assign(Object.create(null) as { exports: Record<string, unknown> }, { exports: moduleExports })
  const customRequire = nullProtoFn((specifier: string): unknown => {
    if (Object.hasOwn(VIRTUAL_MODULES, specifier)) return VIRTUAL_MODULES[specifier]
    throw new Error(`Extension module import '${specifier}' is not in VIRTUAL_MODULES.`)
  })
  const sandbox = vm.createContext(
    Object.assign(Object.create(null) as Record<string, unknown>, {
      module: moduleObj,
      exports: moduleExports,
      require: customRequire,
      api,
    }),
    { name: 'extension-in-process', codeGeneration: { strings: false, wasm: false } },
  )
  new vm.Script(code, { filename: options.filePath }).runInContext(sandbox, { timeout: 5_000 })
  const exported = moduleObj.exports
  const defaultExport = exported.default ?? exported.activate
  if (typeof defaultExport === 'function') defaultExport(api)

  return { tools, commands, shortcuts, flags, handlers, events, readWorkspaceFile: safeRead, exports: exported }
}

export async function executeInProcessScript(options: {
  readonly root: string
  readonly scriptFile: string
  readonly record: VersionRecord
  readonly argv: readonly string[]
  readonly denyRules: () => readonly DenyRule[]
  readonly context: ToolExecutionContext
  readonly invoke?: InProcessExtensionInvoke
  readonly host?: ExtensionHostBridge
}): Promise<ToolExecutionResult> {
  options.context.abortSignal?.throwIfAborted()
  const rawSource = fs.readFileSync(options.scriptFile, 'utf8')
  const code = transpileExtensionSource(rawSource, options.scriptFile)
  const timeoutMs = 30_000
  const registeredTools: Array<{ readonly name: string; readonly description: string }> = []
  const registeredCommands: Array<{ readonly name: string; readonly description: string; readonly aliases: readonly string[] }> = []
  const registeredShortcuts: Array<{ readonly key: string; readonly description: string }> = []
  const registeredFlags: Array<{ readonly name: string; readonly type: string }> = []
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
        worker.unref()
        finish({ ok: false, output: 'Extension execution aborted.' })
      }
      const timer = setTimeout(() => {
        void worker.terminate()
        worker.unref()
        finish({ ok: false, output: `Extension execution timed out after ${timeoutMs}ms.` })
      }, timeoutMs)
      timer.unref?.()
      options.context.abortSignal?.addEventListener('abort', onAbort, { once: true })

      worker.on('message', (msg: { readonly kind: string; readonly json: string }) => {
        if (msg.kind === 'done') finish({ ok: true, output: msg.json })
        else if (msg.kind === 'error') finish({ ok: false, output: msg.json })
        else if (msg.kind === 'registerTool') {
          const info = JSON.parse(msg.json) as { name: string; description?: string }
          registeredTools.push({ name: info.name, description: String(info.description ?? '') })
        } else if (msg.kind === 'registerCommand') {
          const info = JSON.parse(msg.json) as { name: string; description?: string; aliases?: string[] }
          registeredCommands.push({ name: info.name, description: String(info.description ?? ''), aliases: Array.isArray(info.aliases) ? info.aliases.map(String) : [] })
        } else if (msg.kind === 'registerShortcut') {
          const info = JSON.parse(msg.json) as { key: string; description?: string }
          registeredShortcuts.push({ key: info.key, description: String(info.description ?? '') })
        } else if (msg.kind === 'registerFlag') {
          const info = JSON.parse(msg.json) as { name: string; type?: string }
          registeredFlags.push({ name: info.name, type: String(info.type ?? 'string') })
        } else if (msg.kind === 'registerEvent') {
          const info = JSON.parse(msg.json) as { event: string }
          if (!registeredEvents.includes(info.event)) registeredEvents.push(info.event)
        } else if (msg.kind === 'rpc') {
          const parsed = JSON.parse(msg.json) as { id: number; op: string; payload?: Record<string, unknown> }
          void handleWorkerHostRpc(parsed.op, parsed.payload ?? {}, { root: options.root, denyRules: options.denyRules, host: options.host })
            .then(value => {
              if (!settled) worker.postMessage({ kind: 'reply', id: parsed.id, ok: true, json: value === undefined ? '' : JSON.stringify(value) })
            })
            .catch(err => {
              if (!settled) worker.postMessage({ kind: 'reply', id: parsed.id, ok: false, json: err instanceof Error ? err.message : String(err) })
            })
        }
      })
      worker.on('error', err => finish({ ok: false, output: err instanceof Error ? err.message : String(err) }))
      worker.on('exit', codeExit => {
        if (!settled) finish({ ok: false, output: `Extension worker exited unexpectedly (${codeExit}).` })
      })
    })

    const detail = redactUnsafeReportText(redactReportText(outcome.output, 16_000, { projectRoot: options.root }), new Set(), 16_000)
    return {
      success: outcome.ok,
      output: `${detail}\nExtension execution: ${outcome.ok ? 'completed' : 'failed'}; exit ${outcome.ok ? 0 : 1}; mode in-process; source ${options.record.source}; SHA256 ${options.record.digest}.`,
      metadata: {
        extension: options.record.manifest.name,
        source: options.record.source,
        version: options.record.manifest.version,
        digest: options.record.digest,
        cleanup: 'confirmed',
        eventOutput: outcome.output,
        registeredTools,
        registeredCommands,
        registeredShortcuts,
        registeredFlags,
        registeredEvents,
      },
    }
  } finally {
    void worker.terminate().catch(() => {})
    worker.unref()
  }
}
