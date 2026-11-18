import http from 'node:http';
import { readStructuredLogs, traceRows, type TraceRow } from './diagnostics.js';
import type { TelemetryStore } from './tracing/types.js';
import { captureTraceReadScope, sessionLog, type TraceReadScope } from './tracing/scope.js';
import { readScopedTracePage, spanRows, traceReadQuery } from './tracing/view.js';
import type { TraceLogSink } from './tracing/context.js';
import { isStoredSpanLog } from './tracing/records.js';
export interface TraceDashboard {
  readonly url: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}

interface DashboardSource {
  readonly directory: string;
  readonly currentPath: string;
  readonly store?: TelemetryStore;
  readonly sink?: TraceLogSink;
  readonly scope: ReturnType<typeof captureTraceReadScope>;
}

let binding: { readonly source: DashboardSource; readonly listening: Promise<TraceDashboard>;
  readonly result: Promise<TraceDashboard>; dashboard?: TraceDashboard } | undefined;

function releaseSource(source: DashboardSource): void {
  if (binding?.source === source) binding = undefined;
}

function currentBinding(): typeof binding {
  const current = binding;
  if (!current || current.source.scope.admit()) return current;
  releaseSource(current.source);
  void current.result.then(dashboard => dashboard.close()).catch(() => {});
  return undefined;
}

/** Command controls may address only the dashboard's original storage and session. */
export function traceDashboardMatches(directory: string, sessionId: string | undefined, workspaceRoot?: string, sink?: TraceLogSink): boolean {
  const source = currentBinding()?.source;
  return source === undefined || source.directory === directory && source.scope.sessionId === sessionId
    && source.scope.workspaceRoot === workspaceRoot && source.sink === sink;
}

/** Start a report-safe, loopback-only trace viewer. The caller owns explicit close. */
export async function openTraceDashboard(
  directory: string,
  currentPath: string,
  traceStore?: TelemetryStore,
  scope: TraceReadScope = {},
  sink?: TraceLogSink,
): Promise<TraceDashboard> {
  const captured = captureTraceReadScope(scope, directory, currentPath);
  if (!captured.admit()) throw new Error('The captured trace source is unavailable.');
  const current = currentBinding();
  if (current) {
    const original = current.source;
    if (original.directory !== directory || original.sink !== sink
      || (sink === undefined && (original.currentPath !== currentPath || original.store !== traceStore))
      || original.scope.profile !== captured.profile || original.scope.sessionId !== captured.sessionId
      || original.scope.workspaceRoot !== captured.workspaceRoot || original.scope.projectRoot !== captured.projectRoot) {
      throw new Error('Trace dashboard is bound to a different source or session.');
    }
    const dashboard = await current.result;
    if (binding !== current || !captured.admit()) throw new Error('The captured trace source is unavailable.');
    return dashboard;
  }
  const source = { directory, currentPath, store: traceStore, sink, scope: captured };
  const listening = startTraceDashboard(source);
  const result = listening.then(async dashboard => {
    if (binding?.source !== source || !captured.admit()) {
      await dashboard.close();
      throw new Error('The captured trace source is unavailable.');
    }
    binding.dashboard = dashboard;
    return dashboard;
  }).catch(error => { releaseSource(source); throw error; });
  binding = { source, listening, result };
  return result;
}

async function startTraceDashboard(source: DashboardSource): Promise<TraceDashboard> {
  const { directory, currentPath, store, sink, scope } = source;
  const admit = () => binding?.source === source && scope.admit();
  const refuse = (response: http.ServerResponse): void => {
    releaseSource(source);
    response.once('close', () => { void close().catch(() => {}); });
    response.writeHead(409, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', connection: 'close' });
    response.end('The captured trace source is unavailable.');
  };
  const server = http.createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (!admit()) return refuse(response);
        if (request.method !== 'GET' || !['/', '/data'].includes(url.pathname)) {
          response.writeHead(404, { 'cache-control': 'no-store' }); response.end('Not found'); return;
        }
        const query = traceReadQuery(url, scope.sessionId);
        const logs = readStructuredLogs(directory, sink?.getCurrentFilePath() ?? currentPath, 200,
          entry => sessionLog(entry, scope.sessionId, scope.workspaceRoot)
            && (!store || !isStoredSpanLog(entry))
            && (!query.name || entry.component === query.name) && (!query.errors || ['warn', 'error'].includes(entry.level)));
        const logRows = traceRows(logs.entries, scope.projectRoot);
        const stored = store ? await readScopedTracePage(store, query, scope.sessionId, scope.workspaceRoot, admit) : undefined;
        if (!admit() || stored?.admitted === false) return refuse(response);
        const spans = (stored?.traces ?? []).flatMap(trace => trace.spans);
        const rows = [...spanRows(spans, scope.projectRoot), ...logRows];
        if (url.pathname === '/data') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          response.end(JSON.stringify({ status: logs.status, coverage: store?.coverage, cursor: stored?.cursor,
            incomplete: logs.status !== 'reported' || logs.limitReached === true
              || stored?.cursor !== undefined || stored?.incomplete === true, rows }));
          return;
        }
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(render(rows, logs.limitReached === true || stored?.cursor !== undefined
          || stored?.incomplete === true || logs.status !== 'reported'));
      } catch {
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        }
        response.end('Internal error');
      }
    })();
  });
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= new Promise<void>((resolve, reject) => {
    releaseSource(source);
    server.close(error => {
      if (error) { reject(error); return; }
      resolve();
    });
    server.closeAllConnections?.();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') { await close(); throw new Error('Trace dashboard address was unavailable.'); }
  return { url: `http://127.0.0.1:${address.port}/`, port: address.port, close };
}

export async function closeTraceDashboard(): Promise<boolean> {
  const current = binding;
  if (!current) return false;
  releaseSource(current.source);
  let dashboard: TraceDashboard;
  try { dashboard = current.dashboard ?? await current.listening; } catch { return false; }
  await dashboard.close();
  return true;
}

export function traceDashboardStatus(): TraceDashboard | undefined { return currentBinding()?.dashboard; }

function render(rows: readonly TraceRow[], bounded: boolean): string {
  const body = rows.map(row => `<tr><td>${escape(row.timestamp)}</td><td>${escape(row.traceId)}</td><td>${escape(row.spanId)}</td><td>${escape(row.requestId ?? '[missing request id]')}</td><td>${escape(row.toolId ?? '[missing tool id]')}</td><td>${row.durationMs === undefined ? '[missing duration]' : `${row.durationMs}ms`}</td><td>${escape(row.component)}</td><td>${escape(row.message)}${renderSpanDetails(row)}</td></tr>`).join('');
  const note = bounded ? '<p>The view is bounded. Additional retained records may not be displayed.</p>' : '';
  return `<!doctype html><meta charset="utf-8"><title>Cheers trace</title><style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35rem;text-align:left}code{white-space:nowrap}</style><h1>Cheers trace</h1><p>Loopback only. Refresh to reread retained structured logs. Missing IDs and durations are labeled; they are not inferred.</p>${note}<table><thead><tr><th>Time</th><th>Trace</th><th>Span</th><th>Request</th><th>Tool</th><th>Duration</th><th>Component</th><th>Message</th></tr></thead><tbody>${body}</tbody></table>`;
}

function renderSpanDetails(row: TraceRow): string {
  const events = row.events?.map(event => `<div><time>${escape(event.timestamp)}</time> <code>${escape(event.name)}</code>${event.endpoint ? ` ${escape(event.endpoint)}` : ''}</div>`).join('') ?? '';
  const links = row.links?.map(link => `<div>Linked span <code>${escape(link.traceId)}/${escape(link.spanId)}</code></div>`).join('') ?? '';
  return events + links;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
