import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import type { ExecutionService, CommandExecutionResult } from '../runtime/execution/types.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { LanguageError, languageLimits, object, type DocumentSnapshot, type JsonObject, type LanguageStatus, type ServerSelection } from './contract.js';
import { endPosition, languageId, snapshot } from './documents.js';
import { RpcConnection } from './protocol.js';

export function serverSelection(value: unknown): ServerSelection {
  if (process.platform === 'win32') throw new LanguageError('unavailable', 'Language server process-group cleanup is unavailable on Windows; use the explicit scanner backend.');
  const selected = object(value);
  if (typeof selected.command !== 'string' || !path.isAbsolute(selected.command) || selected.command.length > 4096
    || /[\x00-\x1f\x7f]/.test(selected.command) || !Array.isArray(selected.args) || selected.args.length > 32
    || selected.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0'))) {
    throw new LanguageError('invalid', 'Choose an explicit absolute installed language-server executable and bounded argument list.');
  }
  // Do not follow PATH, project manifests, local plugins or auto-install commands.
  try { if (!statSync(selected.command).isFile() || realpathSync(selected.command) !== selected.command) throw new Error(); }
  catch { throw new LanguageError('unavailable', 'The selected language-server executable is unavailable or is a symbolic link.'); }
  return Object.freeze({ command: selected.command, args: Object.freeze([...(selected.args as string[])]) });
}

export class LanguageClient {
  status: LanguageStatus = 'starting';
  capabilities: JsonObject = {};
  readonly documents = new Map<string, DocumentSnapshot>();
  readonly diagnostics = new Map<string, { readonly version?: number; readonly values: readonly unknown[]; readonly rejectedStale: number; readonly received: boolean }>();
  private readonly controller = new AbortController();
  private readonly rpc: RpcConnection;
  private readonly done: Promise<CommandExecutionResult>;
  private readonly root: string;
  private idle: ReturnType<typeof setTimeout> | undefined;
  private stderr = 0;
  private cleanupFailed = false;
  private closing: Promise<void> | undefined;
  private readonly publications = new EventEmitter();
  private waiting = 0;

  constructor(service: ExecutionService, selection: ServerSelection, context: ToolExecutionContext) {
    this.root = realpathSync(context.artifactRoot ?? context.workspaceRoot);
    let rpc!: RpcConnection;
    this.done = service.runCommand({ operationKind: 'command.run', command: selection.command, args: selection.args,
      cwd: this.root, workspaceRoot: this.root, authority: { mode: 'command-allowlisted', source: 'tool-runtime-approval', reason: 'Language server execution passed the normal tool approval gate.' },
      caller: 'language:server', reason: 'Run the explicitly selected language server. Server code executes with OS process permissions.',
      reportSafeCommand: 'Selected language server', timeoutMs: languageLimits.lifetimeMs, abortSignal: this.controller.signal,
      env: serverEnvironment(context.commandEnv ?? process.env),
      captureOutput: false, cleanupTreeOnExit: true, onStdin: input => { rpc = new RpcConnection(input, (method, params) => this.notification(method, params)); },
      onStdout: chunk => {
        try { rpc.frames.push(chunk); }
        catch { rpc.close(new LanguageError('protocol', 'Language server sent invalid or excessive protocol output.')); throw new Error('Language protocol failed.'); }
      },
      onStderr: chunk => { this.stderr += chunk.length; if (this.stderr > languageLimits.stderrBytes) throw new Error('Language server stderr limit exceeded.'); },
    });
    this.rpc = rpc;
    void this.done.then(result => {
      clearTimeout(this.idle);
      this.cleanupFailed = result.terminationFailed === true;
      if (this.cleanupFailed) this.status = 'cleanup-unverified';
      else if (this.status !== 'stopping') this.status = 'crashed';
      else this.status = 'stopped';
      this.rpc.close(new LanguageError(result.spawnErrorCode === 'ENOENT' ? 'unavailable' : this.cleanupFailed ? 'cleanup' : 'crashed',
        this.cleanupFailed ? 'Language server cleanup is unverified; restart is blocked.' : 'Language server process exited.'));
      this.publications.emit('closed');
    });
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    const onAbort = () => this.controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      if (signal?.aborted) throw new LanguageError('cancelled', 'Language startup was cancelled.');
      const result = object(await this.rpc.request('initialize', { processId: process.pid, rootUri: pathToFileURL(this.root).href,
        workspaceFolders: [{ uri: pathToFileURL(this.root).href, name: path.basename(this.root) }],
        initializationOptions: { disableAutomaticTypingAcquisition: true },
        capabilities: { general: { positionEncodings: ['utf-16'] }, workspace: { applyEdit: false },
          textDocument: { synchronization: { dynamicRegistration: false }, publishDiagnostics: { versionSupport: true } } },
      }, signal));
      this.capabilities = object(result.capabilities);
      if (this.capabilities.positionEncoding !== undefined && this.capabilities.positionEncoding !== 'utf-16') throw new LanguageError('unsupported', 'Language server does not support UTF-16 positions.');
      await this.rpc.notify('initialized', {});
      if (this.status !== 'starting') throw new LanguageError('crashed', 'Language server exited during initialization.');
      this.status = 'ready'; this.touch();
    } catch (error) { await this.stop(); throw error; }
    finally { signal?.removeEventListener('abort', onAbort); }
  }

  async synchronize(file: string, context: ToolExecutionContext): Promise<DocumentSnapshot> {
    const current = await snapshot(file, context);
    const before = this.documents.get(current.uri);
    if (before?.hash === current.hash) return before;
    const sync = this.capabilities.textDocumentSync;
    const kind = typeof sync === 'number' ? sync : sync && typeof sync === 'object' ? (sync as JsonObject).change : undefined;
    if (kind !== 1 && kind !== 2 || typeof sync === 'object' && sync !== null && (sync as JsonObject).openClose !== true) throw new LanguageError('unsupported', 'Language server does not advertise supported document synchronization with open/close notifications.');
    if (!before && this.documents.size >= languageLimits.documents) throw new LanguageError('unavailable', 'Language server document limit reached; restart to open another set.');
    const document = Object.freeze({ ...current, version: before ? before.version + 1 : 1 });
    this.documents.set(document.uri, document);
    this.diagnostics.delete(document.uri);
    await this.rpc.notify(before ? 'textDocument/didChange' : 'textDocument/didOpen', before
      ? { textDocument: { uri: document.uri, version: document.version }, contentChanges: [{ ...(kind === 2 ? { range: { start: { line: 0, character: 0 }, end: endPosition(before.text) } } : {}), text: document.text }] }
      : { textDocument: { uri: document.uri, languageId: languageId(document.path), version: document.version, text: document.text } });
    return document;
  }

  request(method: string, params: unknown, signal?: AbortSignal, timeoutMs?: number): Promise<unknown> {
    if (this.status !== 'ready') return Promise.reject(new LanguageError('crashed', 'Language server is not ready; use restart.'));
    this.touch();
    return this.rpc.request(method, params, signal, timeoutMs);
  }

  private notification(method: string, params: unknown): void {
    if (method !== 'textDocument/publishDiagnostics') return;
    const data = object(params);
    if (typeof data.uri !== 'string' || !this.documents.has(data.uri)) return;
    const doc = this.documents.get(data.uri)!;
    const prior = this.diagnostics.get(data.uri);
    if (data.version !== undefined && data.version !== doc.version) {
      this.diagnostics.set(data.uri, { ...(prior ?? { values: [], received: false }), rejectedStale: (prior?.rejectedStale ?? 0) + 1 });
      return;
    }
    if (!Array.isArray(data.diagnostics) || data.diagnostics.length > 200) throw new LanguageError('protocol', 'Language diagnostics limit exceeded.');
    this.diagnostics.set(data.uri, { values: data.diagnostics, received: true, ...(typeof data.version === 'number' ? { version: data.version } : {}), rejectedStale: prior?.rejectedStale ?? 0 });
    this.publications.emit('diagnostics', data.uri);
  }

  async waitDiagnostics(uri: string, signal?: AbortSignal): Promise<void> {
    if (this.diagnostics.get(uri)?.received) return;
    if (this.waiting >= 8) throw new LanguageError('unavailable', 'Language diagnostic wait limit reached.');
    if (signal?.aborted) throw new LanguageError('cancelled', 'Language diagnostics were cancelled.');
    this.waiting++;
    try {
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: LanguageError) => {
          clearTimeout(timer); this.publications.removeListener('diagnostics', onPublish); this.publications.removeListener('closed', onClosed);
          signal?.removeEventListener('abort', onAbort); error ? reject(error) : resolve();
        };
        const onPublish = (published: string) => { if (published === uri) finish(); };
        const onClosed = () => finish(new LanguageError('crashed', 'Language server exited while diagnostics were pending.'));
        const onAbort = () => finish(new LanguageError('cancelled', 'Language diagnostics were cancelled.'));
        const timer = setTimeout(() => finish(), 1000);
        this.publications.on('diagnostics', onPublish); this.publications.once('closed', onClosed); signal?.addEventListener('abort', onAbort, { once: true });
        if (this.status !== 'ready') onClosed();
      });
    } finally { this.waiting--; }
  }

  private touch(): void { clearTimeout(this.idle); this.idle = setTimeout(() => { void this.stop().catch(() => {}); }, languageLimits.idleMs); this.idle.unref(); }

  async stop(): Promise<void> {
    if (this.cleanupFailed) throw new LanguageError('cleanup', 'Language server cleanup is unverified; restart is blocked.');
    if (this.closing) return this.closing;
    this.closing = this.shutdown();
    return this.closing;
  }

  private async shutdown(): Promise<void> {
    clearTimeout(this.idle);
    if (this.status === 'ready') {
      this.status = 'stopping';
      try { await this.rpc.request('shutdown', null, undefined, 500); await this.rpc.notify('exit'); } catch { /* Force cleanup through the execution owner below. */ }
    } else if (this.status !== 'crashed') this.status = 'stopping';
    const timer = setTimeout(() => this.controller.abort(), 500);
    try {
      await this.done;
      if (this.cleanupFailed) throw new LanguageError('cleanup', 'Language server cleanup is unverified; restart is blocked.');
    } finally { clearTimeout(timer); }
  }
}

function serverEnvironment(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(['PATH', 'HOME', 'USERPROFILE', 'TMPDIR', 'LANG', 'SYSTEMROOT'].flatMap(key => source[key] === undefined ? [] : [[key, source[key]!]]));
}
