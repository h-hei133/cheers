import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled, setStructuredLogSink } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false); setStructuredLogSink(null);
const { TurnSink } = await load('cli/interactive/turnSink.js');
const { TranscriptPane } = await load('presentation/tui/surface/pane.js');
const { sessionTelemetries } = await load('observability/usage/state.js');
const receipt = { events: {}, toggles: [], paints: [], ended: false };
const digest = text => createHash('sha256').update(text).digest('hex');
const blocks = transcript => transcript.all().filter(block => block.kind === 'thinking').map(block => ({
  characters: block.text.length, digest: digest(block.text), collapsed: block.collapsed, finalized: block.finalized,
}));
function save() { fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt)); }
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  const result = handle.call(this, event);
  receipt.events[event.type] = (receipt.events[event.type] ?? 0) + 1;
  if (event.type === 'query.completed') receipt.result = { status: event.result.status,
    terminalClassification: event.result.terminalClassification };
  if (event.type === 'query.failed') receipt.failed = { admissionFailure: event.admissionFailure,
    suspectedClass: /auth|401|403/i.test(event.error) ? 'provider-auth' : /network|fetch|timeout/i.test(event.error) ? 'provider-network' : 'unclassified' };
  return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) {
  const result = end.apply(this, args);
  receipt.ended = true; receipt.blocks = blocks(this.transcript);
  receipt.usage = [...sessionTelemetries().values()].map(usage => ({
    turns: usage.turnsCount, toolCalls: usage.toolCallsCount,
    request: usage.requestContext && { model: usage.requestContext.model, endpoint: usage.requestContext.endpoint,
      bodyBytes: usage.requestContext.body.bytes, capturedAt: usage.requestContext.capturedAt },
    buckets: Object.values(usage.byModel).map(bucket => ({ uncachedInput: bucket.promptTokens,
      cachedReadInput: bucket.cacheReadTokens, cachedWriteInput: bucket.cacheWriteTokens,
      input: bucket.promptTokens + bucket.cacheReadTokens + bucket.cacheWriteTokens,
      output: bucket.completionTokens, total: bucket.totalTokens, requests: bucket.turnsCount })),
  }));
  save(); return result;
};
const toggle = TranscriptPane.prototype.toggleCollapsed;
TranscriptPane.prototype.toggleCollapsed = function(only) {
  const before = blocks(this.transcript), beforeRows = this.transcript.rowCount(120);
  const result = toggle.call(this, only);
  receipt.toggles.push({ only, changed: result, before, after: blocks(this.transcript),
    beforeRows, afterRows: this.transcript.rowCount(120) });
  save(); return result;
};
const render = TranscriptPane.prototype.render;
TranscriptPane.prototype.render = function(...args) {
  const result = render.apply(this, args);
  receipt.paints.push({ rows: result.length, width: args[0], capacity: args[1], blocks: blocks(this.transcript) });
  receipt.paints = receipt.paints.slice(-6); save(); return result;
};
