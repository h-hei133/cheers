import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { ends: 0, tools: [], failures: [], outcomes: [] };
function classifyFailure(value) {
  const text = typeof value === 'string' ? value : '';
  if (/\bmodel_not_found\b|\bunknown model\b|\bunsupported model\b|model.{0,80}(?:not found|not supported|does not exist|unavailable)/i.test(text)) return 'model-unavailable-suspected';
  if (/\b(?:401|403)\b|unauthori[sz]ed|authentication/i.test(text)) return 'provider-auth-suspected';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network error|connection error|timed out/i.test(text)) return 'provider-network-suspected';
  if (/\b429\b|rate.?limit/i.test(text)) return 'provider-rate-limit-suspected';
  return 'unclassified-live-or-runtime';
}
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(record));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const result = start.apply(this, args); record.sessionId = this.options.runtimeContext.session.id; save(); return result;
};
const cycle = InteractiveMode.prototype.cyclePermissionScope;
InteractiveMode.prototype.cyclePermissionScope = function(...args) {
  const result = cycle.apply(this, args); record.scope = this.options.sessionRuntime.getPermissionScope(); save(); return result;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'tool.result') record.tools.push({ name: ['research_run', 'read', 'glob', 'grep'].includes(event.toolName) ? event.toolName : 'other', success: event.success });
  if (['lifecycle.error', 'query.failed'].includes(event.type)) record.failures.push({ type: event.type, classification: classifyFailure(event.error) });
  if (event.type === 'query.completed') record.outcomes.push({ status: ['completed', 'failed', 'blocked', 'cancelled', 'interrupted', 'partial'].includes(event.result.status) ? event.result.status : 'other',
    classification: classifyFailure(event.result.stopReason) });
  const result = handle.call(this, event); save(); return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
