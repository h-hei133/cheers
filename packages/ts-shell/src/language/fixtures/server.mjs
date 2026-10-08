import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [mode = 'normal', log, outside] = process.argv.slice(2);
const documents = new Map();
let initialized = false;
let input = Buffer.alloc(0);
const record = value => { if (log) fs.appendFileSync(log, JSON.stringify(value) + '\n'); };
const send = value => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...value }));
  process.stdout.write(Buffer.from(`Content-Length: ${body.length}\r\n\r\n`));
  process.stdout.write(body);
};
const reply = (id, result) => send({ id, result });
const range = { start: { line: 0, character: 13 }, end: { line: 0, character: 18 } };
record({ started: true, environmentKeys: Object.keys(process.env), runtimeHome: process.env.HOME, runtimeTmp: process.env.TMPDIR });
process.stdin.on('data', chunk => {
  input = Buffer.concat([input, chunk]);
  while (true) {
    const boundary = input.indexOf('\r\n\r\n');
    if (boundary < 0) return;
    const size = Number(/Content-Length: (\d+)/i.exec(input.subarray(0, boundary).toString())[1]);
    if (input.length < boundary + 4 + size) return;
    const message = JSON.parse(input.subarray(boundary + 4, boundary + 4 + size));
    input = input.subarray(boundary + 4 + size);
    handle(message);
  }
});
function handle(message) {
  record(message);
  const { method, id, params } = message;
  if (method === 'initialize') {
    const capabilities = { textDocumentSync: mode === 'full' ? 1 : mode === 'no-sync' ? 0 : 2,
      definitionProvider: true, referencesProvider: true, hoverProvider: mode !== 'unsupported', documentSymbolProvider: true,
      workspaceSymbolProvider: true, renameProvider: true };
    if (mode === 'closed-sync') capabilities.textDocumentSync = { openClose: false, change: 2 };
    if (mode === 'utf8') capabilities.positionEncoding = 'utf-8';
    reply(id, { capabilities }); return;
  }
  if (method === 'initialized') { initialized = true; return; }
  if (method === 'shutdown') { reply(id, null); return; }
  if (method === 'exit') { process.exit(0); }
  if (method === '$/cancelRequest') { record({ cancelled: params.id }); return; }
  if (!method) return;
  if (!initialized) { send({ id, error: { code: -32002, message: 'initialize ordering reversed' } }); return; }
  if (method === 'textDocument/didOpen' || method === 'textDocument/didChange') {
    const doc = params.textDocument;
    const text = method.endsWith('didOpen') ? doc.text : params.contentChanges[0].text;
    documents.set(doc.uri, { text, version: doc.version });
    const diagnostic = { range, message: 'héllo diagnostic', severity: 2, code: 123 };
    send({ method: 'textDocument/publishDiagnostics', params: { uri: doc.uri, version: doc.version - 1, diagnostics: [{ ...diagnostic, message: 'STALE DIAGNOSTIC' }] } });
    if (mode !== 'stale-diagnostics') send({ method: 'textDocument/publishDiagnostics', params: { uri: doc.uri,
      ...(mode === 'unversioned' ? {} : { version: doc.version }), diagnostics: [diagnostic] } });
    send({ id: 900, method: 'workspace/applyEdit', params: { edit: { changes: { [doc.uri]: [{ range, newText: 'BAD_WRITE' }] } } } });
    return;
  }
  if (method === 'test/stall') return;
  if (mode === 'error') { send({ id, error: { code: -1, message: 'PRIVATE_SERVER_ERROR_CONTENT', data: { secret: 'PRIVATE_BODY' } } }); return; }
  if (mode === 'crash' && !fs.existsSync(log + '.crashed') && method === 'textDocument/hover') { fs.writeFileSync(log + '.crashed', 'yes'); process.exit(4); }
  if (mode === 'malformed' && method === 'textDocument/hover') { process.stdout.write('Content-Length: -1\r\n\r\nPRIVATE_PROTOCOL'); return; }
  if (mode === 'stderr' && method === 'textDocument/hover') { process.stderr.write('PRIVATE_STDERR'.repeat(6000)); return; }
  const uri = params.textDocument?.uri ?? pathToFileURL(path.join(process.cwd(), 'one.ts')).href;
  if (method === 'textDocument/hover') { reply(id, { contents: [{ language: 'typescript', value: documents.get(uri).text }] }); return; }
  if (method === 'textDocument/documentSymbol') { reply(id, [{ name: 'alpha', kind: 13, range, selectionRange: range }]); return; }
  if (method === 'workspace/symbol') { reply(id, [{ name: 'alpha', kind: 13, location: { uri, range } }]); return; }
  if (method === 'textDocument/definition' || method === 'textDocument/references') {
    reply(id, [{ uri: mode === 'outside' ? pathToFileURL(outside).href : uri, range }]); return;
  }
  if (method === 'textDocument/rename') {
    const target = mode === 'outside-edit' || mode === 'second-edit' ? pathToFileURL(outside).href : uri;
    if (mode === 'stale-edit') reply(id, { documentChanges: [{ textDocument: { uri, version: documents.get(uri).version - 1 }, edits: [{ range, newText: params.newName }] }] });
    else if (mode === 'versioned-edit') reply(id, { documentChanges: [{ textDocument: { uri, version: documents.get(uri).version }, edits: [{ range, newText: params.newName }] }] });
    else reply(id, { changes: { [target]: [{ range, newText: params.newName }] } });
    return;
  }
  reply(id, null);
}
