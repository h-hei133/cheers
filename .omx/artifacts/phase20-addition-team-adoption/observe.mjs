import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { ends: 0, tools: [], questions: 0 };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(record));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) { const result = start.apply(this, args); record.sessionId = this.options.runtimeContext.session.id; save(); return result; };
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'tool.result') record.tools.push({ name: event.toolName, success: event.success });
  const result = handle.call(this, event); save(); return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
const cycle = InteractiveMode.prototype.cyclePermissionScope;
InteractiveMode.prototype.cyclePermissionScope = function(...args) { const result = cycle.apply(this, args); record.scope = this.options.sessionRuntime.getPermissionScope(); save(); return result; };
const question = InteractiveMode.prototype.onQuestion;
InteractiveMode.prototype.onQuestion = function(text) {
  const result = question.call(this, text); record.questions++; record.questionPending = true;
  record.preview = { report: text.includes('Team report preview'), originalClaim: text.includes('PUBLIC_TEAM_CLAIM_'),
    falsifiers: text.includes('A profile with zero cache misses.'), reads: text.includes('lines 2-2'),
    limitations: text.includes('not independent confirmation'), decline: text.includes('1. Keep report out'),
    adopt: text.includes('2. Adopt report'), recommended: text.includes('(Recommended)') };
  save(); return result;
};
const settled = InteractiveMode.prototype.onQuestionSettled;
InteractiveMode.prototype.onQuestionSettled = function(...args) {
  const result = settled.apply(this, args); record.questionPending = false; save(); return result;
};
