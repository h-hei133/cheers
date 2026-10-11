import http from 'node:http';
import { readStructuredLogs, traceRows, type TraceRow } from './diagnostics.js';

export interface TraceDashboard {
  readonly url: string;
  readonly port: number;
  readonly close: () => Promise<void>;
}

let active: TraceDashboard | undefined;

/** Start a report-safe, loopback-only trace viewer. The caller owns explicit close. */
export async function openTraceDashboard(directory: string, currentPath: string): Promise<TraceDashboard> {
  if (active) return active;
  const server = http.createServer((request, response) => {
    const logs = readStructuredLogs(directory, currentPath);
    const rows = traceRows(logs.entries);
    if (request.url === '/data') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ status: logs.status, rows }));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(render(rows));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') { server.close(); throw new Error('Trace dashboard address was unavailable.'); }
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= new Promise<void>((resolve, reject) => {
    // Stop accepting before closing connections; compiled runtimes may retire
    // the listening server as part of closeAllConnections.
    server.close(error => {
      if (error) { reject(error); return; }
      if (active?.port === address.port) active = undefined;
      resolve();
    });
    server.closeAllConnections?.();
  });
  active = { url: `http://127.0.0.1:${address.port}/`, port: address.port, close };
  return active;
}

export async function closeTraceDashboard(): Promise<boolean> {
  if (!active) return false;
  await active.close();
  return true;
}

export function traceDashboardStatus(): TraceDashboard | undefined { return active; }

function render(rows: readonly TraceRow[]): string {
  const body = rows.map(row => `<tr><td>${escape(row.timestamp)}</td><td>${escape(row.traceId)}</td><td>${escape(row.spanId)}</td><td>${escape(row.requestId ?? '[missing request id]')}</td><td>${escape(row.toolId ?? '[missing tool id]')}</td><td>${row.durationMs === undefined ? '[missing duration]' : `${row.durationMs}ms`}</td><td>${escape(row.component)}</td><td>${escape(row.message)}</td></tr>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>Cheers trace</title><style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.35rem;text-align:left}code{white-space:nowrap}</style><h1>Cheers trace</h1><p>Loopback only. Refresh to reread bounded structured logs. Missing IDs and durations are labeled; they are not inferred.</p><table><thead><tr><th>Time</th><th>Trace</th><th>Span</th><th>Request</th><th>Tool</th><th>Duration</th><th>Component</th><th>Message</th></tr></thead><tbody>${body}</tbody></table>`;
}

function escape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
