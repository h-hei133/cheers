import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import { CollaborationError, parseJson, requireValue } from '../contract/value.js';
import { WIRE_BYTES } from '../contract/model.js';
import type { ServiceConfig } from './config.js';
import { ServiceStore } from './store.js';
import { ServiceDispatcher } from './dispatch.js';
import { authenticate } from './auth.js';
import { claimService } from './ownership.js';

/** Explicit foreground listener. No global providers, automatic uploads or public relay. */
export async function startCollaborationService(config: ServiceConfig): Promise<{ close(): Promise<void>; origin: string }> {
  const release = claimService(config.stateFile);
  let store: ServiceStore;
  try { store = new ServiceStore(config.stateFile); } catch (error) { release(); throw error; }
  const dispatcher = new ServiceDispatcher(store, config);
  const sockets = new Set<Socket>(); let active = 0;
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    if (active >= 16) { response.writeHead(503); response.end(); request.destroy(); return; }
    active++;
    const timer = setTimeout(() => { request.destroy(); response.destroy(); }, 10_000);
    let finished = false;
    const done = () => { if (!finished) { finished = true; clearTimeout(timer); active--; } };
    response.once('finish', done); response.once('close', done); response.once('error', () => { done(); request.destroy(); });
    void handleRequest(request, response, config, dispatcher).catch(() => { done(); response.destroy(); });
  };
  const options = { maxHeaderSize: 8 * 1024, requestTimeout: 10_000, headersTimeout: 5_000, keepAliveTimeout: 1_000 };
  const server = config.tls ? createHttpsServer({ ...options, ...config.tls }, handler) : createHttpServer(options, handler);
  server.maxConnections = 32;
  server.on('connection', socket => { sockets.add(socket); socket.setTimeout(10_000, () => socket.destroy()); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => socket.destroy());
  try { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); }); }); }
  catch (error) { release(); throw error; }
  const host = config.host.includes(':') ? `[${config.host}]` : config.host;
  return { origin: `${config.tls ? 'https' : 'http'}://${host}:${config.port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    try { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
    finally { release(); }
  } };
}
async function handleRequest(request: IncomingMessage, response: ServerResponse, config: ServiceConfig, dispatcher: ServiceDispatcher): Promise<void> {
  try {
    requireValue(request.method === 'POST' && request.url === '/v1' && request.headers['content-type'] === 'application/json', 'denied');
    requireValue(!request.headers['content-encoding'] && (!request.headers['content-length'] || Number(request.headers['content-length']) <= WIRE_BYTES));
    const principal = authenticate(config, request.headers.authorization);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length;
      requireValue(size <= WIRE_BYTES, 'capacity'); chunks.push(bytes); }
    const bytes = Buffer.concat(chunks); const source = bytes.toString('utf8'); requireValue(Buffer.from(source).equals(bytes));
    const payload = dispatcher.execute(principal, parseJson(source, WIRE_BYTES)); const result = JSON.stringify(payload);
    requireValue(Buffer.byteLength(result) <= WIRE_BYTES, 'capacity');
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(result), 'connection': 'close' }); response.end(result);
  } catch (error) {
    const code = error instanceof CollaborationError ? error.code : 'unknown';
    if (!response.headersSent && !response.destroyed) { response.writeHead(code === 'denied' ? 403 : code === 'capacity' || code === 'busy' ? 429 : 409,
      { 'content-type': 'application/json', 'cache-control': 'no-store', 'connection': 'close' }); response.end(JSON.stringify({ version: 1, error: code })); }
    request.resume();
  }
}
