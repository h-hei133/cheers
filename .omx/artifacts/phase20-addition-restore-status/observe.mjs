import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js'); setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { ends: 0, reports: [] };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(record));
const SessionManager = (await load('session/SessionManager.js')).SessionManager;
const addTurn = SessionManager.prototype.addTurn;
SessionManager.prototype.addTurn = function(id, message) {
  if (message.metadata?.fileUndo) { record.fileUndo = message.metadata.fileUndo; save(); }
  try {
    const result = addTurn.call(this, id, message);
    if (message.metadata?.fileUndo) {
      record.noticeWrite = { returned: true, loaded: this.getSession(id)?.turns.some(turn => turn.metadata?.fileUndo),
        recorded: this.getTranscriptEvents(id).some(event => event.type === 'message' && event.metadata?.fileUndo) };
      save();
    }
    return result;
  } catch (error) {
    if (message.metadata?.fileUndo) {
      record.noticeWrite = { returned: false, errorName: error?.name,
        sourceFrames: String(error?.stack).split('\n').slice(1, 5).map(frame => frame.replace(process.env.CHEERS_PROBE_BUILD, '<build>')),
        errorMessage: error?.message === 'Invalid persisted session usage key' ? error.message : '<unclassified>' };
      save();
    }
    throw error;
  }
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const result = start.apply(this, args); record.sessionId = this.options.runtimeContext.session.id; save(); return result;
};
const cycle = InteractiveMode.prototype.cyclePermissionScope;
InteractiveMode.prototype.cyclePermissionScope = function(...args) {
  const result = cycle.apply(this, args); record.scope = this.options.sessionRuntime.getPermissionScope(); save(); return result;
};
const line = TurnSink.prototype.line;
TurnSink.prototype.line = function(text, report) {
  if (report) record.reports.push({ title: report.title, status: report.facts.status,
    restored: report.facts.restored, steps: report.facts.steps, skipped: report.facts.skipped });
  const result = line.call(this, text, report); save(); return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
const input = InteractiveMode.prototype.onKey;
InteractiveMode.prototype.onKey = function(...args) {
  const result = input.apply(this, args);
  record.input = { busy: this.busy, pager: this.pager.active, overlay: Boolean(this.overlay.active),
    key: args[0].keyId, draftLength: this.state.editor.getText().length }; save(); return result;
};
const pagerOpen = (await load('presentation/tui/chrome/pager.js')).Pager.prototype.open;
const Pager = (await load('presentation/tui/chrome/pager.js')).Pager;
Pager.prototype.open = function(...args) { const result = pagerOpen.apply(this, args); record.pager = this.active; save(); return result; };
const pagerClose = Pager.prototype.close;
Pager.prototype.close = function(...args) { const result = pagerClose.apply(this, args); record.pager = this.active; save(); return result; };
