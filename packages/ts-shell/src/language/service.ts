import type { ExecutionService } from '../runtime/execution/types.js';
import type { ToolExecutionContext } from '../tools/types.js';
import { LanguageClient, serverSelection } from './client.js';
import { LanguageError, languageLimits, object, position, type ServerSelection } from './contract.js';
import { offsetAt, snapshot } from './documents.js';
import { renamePlan } from './edits.js';
import { diagnostic, hover, locations, symbols } from './projection.js';
import { executionWorkspace, executionWorkspaceKey } from '../runtime/execution/binding.js';

const methods: Record<string, { readonly method: string; readonly capability: string }> = {
  definition: { method: 'textDocument/definition', capability: 'definitionProvider' },
  references: { method: 'textDocument/references', capability: 'referencesProvider' },
  hover: { method: 'textDocument/hover', capability: 'hoverProvider' },
  documentSymbol: { method: 'textDocument/documentSymbol', capability: 'documentSymbolProvider' },
  workspaceSymbol: { method: 'workspace/symbol', capability: 'workspaceSymbolProvider' },
  rename: { method: 'textDocument/rename', capability: 'renameProvider' },
};

// Catalogs are rebuilt for every prompt. The bounded process lifecycle belongs
// to the session/project identity and survives those lightweight adapters.
const clients = new Map<string, LanguageClient>();
const starting = new Set<string>();
const changing = new Set<string>();

export class LanguageService {
  private readonly clients = clients;
  private readonly starting = starting;
  private readonly changing = changing;
  constructor(private readonly execution: ExecutionService) {}

  async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown> {
    if (args.server === undefined) throw new LanguageError('unavailable', 'No language server is selected. Supply an explicit installed executable and arguments, or choose backend: scanner for compatibility.');
    const root = executionWorkspace(args, args.server, context.artifactRoot ?? context.workspaceRoot);
    const selection = serverSelection(args.server);
    const key = JSON.stringify([context.sessionId ?? context.taskId, executionWorkspaceKey(args, args.server, root), selection]);
    const operation = args.operation as string;
    let client = this.clients.get(key);
    if (operation === 'status') return { backend: 'server', status: client?.status ?? 'unavailable' };
    if (operation === 'shutdown' || operation === 'restart') {
      if (this.changing.has(key) || this.starting.has(key)) throw new LanguageError('unavailable', 'Language server lifecycle change is already in progress.');
      this.changing.add(key);
      try {
        if (client) { await client.stop(); if (this.clients.get(key) === client) this.clients.delete(key); }
        if (operation === 'shutdown') return { backend: 'server', status: 'stopped' };
        const replacement = await this.start(key, selection, { ...context, artifactRoot: root });
        return { backend: 'server', status: replacement.status };
      } finally { this.changing.delete(key); }
    }
    if (this.changing.has(key)) throw new LanguageError('unavailable', 'Language server lifecycle change is in progress.');
    if (!methods[operation] && operation !== 'diagnostics') throw new LanguageError('invalid', 'Unknown language operation.');
    if (!client) client = await this.start(key, selection, { ...context, artifactRoot: root });
    if (client.status !== 'ready') throw new LanguageError('crashed', 'Language server is not ready; use restart explicitly.');
    return this.query(client, operation, args, { ...context, artifactRoot: root });
  }

  private async start(key: string, selection: ServerSelection, context: ToolExecutionContext): Promise<LanguageClient> {
    if (this.starting.has(key)) throw new LanguageError('unavailable', 'Language server startup is already in progress.');
    for (const [oldKey, client] of this.clients) {
      if (client.status === 'stopped' && !this.changing.has(oldKey) && !this.starting.has(oldKey)) this.clients.delete(oldKey);
    }
    if (this.clients.size >= languageLimits.clients) throw new LanguageError('unavailable', 'Language server lifecycle limit reached; shut down an existing server.');
    this.starting.add(key);
    const client = new LanguageClient(this.execution, selection, context);
    this.clients.set(key, client);
    try { await client.initialize(context.abortSignal); return client; }
    finally { this.starting.delete(key); }
  }

  private async query(client: LanguageClient, operation: string, args: Record<string, unknown>, context: ToolExecutionContext): Promise<unknown> {
    const method = methods[operation];
    if (method && !client.capabilities[method.capability]) throw new LanguageError('unsupported', `Language server does not advertise ${operation}.`);
    const document = operation === 'workspaceSymbol' ? undefined : await client.synchronize(requiredFile(args), context);
    if (operation === 'diagnostics') {
      if (!document) throw new LanguageError('invalid', 'Diagnostics require a file.');
      if (client.capabilities.diagnosticProvider) {
        const result = object(await client.request('textDocument/diagnostic', { textDocument: { uri: document.uri } }, context.abortSignal));
        await unchanged(document.path, document.hash, context);
        if (result.kind !== 'full' || !Array.isArray(result.items) || result.items.length > 200) throw new LanguageError('unsupported', 'Language server returned unsupported pull diagnostics.');
        return { backend: 'server', version: document.version, currency: 'request-source-verified', diagnostics: result.items.map(item => diagnostic(item, context)) };
      }
      // A bounded barrier gives ordered server notifications a chance to arrive. A
      // missing publication never becomes an empty, verified diagnostic result.
      if (client.capabilities.documentSymbolProvider) await client.request('textDocument/documentSymbol', { textDocument: { uri: document.uri } }, context.abortSignal);
      await client.waitDiagnostics(document.uri, context.abortSignal);
      await unchanged(document.path, document.hash, context);
      const published = client.diagnostics.get(document.uri);
      return { backend: 'server', version: document.version,
        currency: !published?.received ? 'unavailable' : published.version === document.version ? 'version-verified' : 'unversioned-currency-unverified',
        rejectedStale: published?.rejectedStale ?? 0,
        diagnostics: published?.received ? published.values.map(item => diagnostic(item, context)) : null };
    }
    let params: Record<string, unknown>;
    if (operation === 'workspaceSymbol') params = { query: typeof args.symbol === 'string' ? args.symbol : '' };
    else {
      params = { textDocument: { uri: document!.uri } };
      if (operation !== 'documentSymbol') {
        const point = position({ line: args.line, character: args.character });
        offsetAt(document!.text, point); params.position = point;
      }
      if (operation === 'references') params.context = { includeDeclaration: true };
      if (operation === 'rename') {
        if (typeof args.newName !== 'string' || !args.newName || args.newName.length > 256 || /[\x00-\x1f\x7f]/.test(args.newName)) throw new LanguageError('invalid', 'Rename requires a bounded newName.');
        params.newName = args.newName;
      }
    }
    const value = await client.request(method!.method, params, context.abortSignal);
    if (document) await unchanged(document.path, document.hash, context);
    const data = operation === 'rename' ? value === null ? { status: 'no-edits', willWrite: false } : await renamePlan(value, client.documents, context)
      : operation === 'definition' || operation === 'references' ? locations(value, context)
      : operation === 'hover' ? hover(value) : symbols(value ?? [], context);
    return { backend: 'server', operation, ...(document ? { documentVersion: document.version, sourceHash: document.hash } : {}),
      ...(operation === 'rename' ? { editPlan: data } : { result: data }) };
  }
}

function requiredFile(args: Record<string, unknown>): string {
  if (typeof args.filePath !== 'string' || !args.filePath) throw new LanguageError('invalid', 'This language operation requires filePath.');
  return args.filePath;
}

async function unchanged(file: string, hash: string, context: ToolExecutionContext): Promise<void> {
  if ((await snapshot(file, context)).hash !== hash) throw new LanguageError('stale', 'Language source changed while the request was running.');
}
