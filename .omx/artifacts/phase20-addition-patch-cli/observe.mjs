import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const { Pager } = await load('presentation/tui/chrome/pager.js');
const receipt = { requests: 0, starts: 0, ends: 0, approvals: [], results: [], scopes: [] };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
for(const name of ['open','close']){
  const original=Pager.prototype[name];
  Pager.prototype[name]=function(...args){const result=original.apply(this,args);
    receipt.pager={active:this.active,firstDeclared:this.text.includes(process.env.CHEERS_PROBE_FIRST),
      secondDeclared:this.text.includes(process.env.CHEERS_PROBE_SECOND)};save();return result;};
}
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const result = start.apply(this, args);
  receipt.sessionId = this.options.runtimeContext.session.id; save(); return result;
};
const cycle = InteractiveMode.prototype.cyclePermissionScope;
InteractiveMode.prototype.cyclePermissionScope = function(...args) {
  const result = cycle.apply(this, args);
  receipt.scopes.push(this.options.sessionRuntime.getPermissionScope()); save(); return result;
};
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args);
  const target = process.env.CHEERS_PROBE_TARGET, directory = path.dirname(target);
  receipt.snapshot = { title: this.picker?.title, current: this.model.current()?.id,
    loading: this.loading, visible: this.model.visible.filter(row => !row.disabled).map(row => row.id),
    targetDeclared: this.model.visible.some(row => row.detail?.includes(target)),
    directoryDeclared: this.model.visible.some(row => row.detail?.includes(directory)),
    painted: [...new Set([...this.listRows.values()].flat().map(row => row.id))],
    groups:this.model.visible.map(row=>({id:row.id,first:(row.detail??row.label).includes(process.env.CHEERS_PROBE_FIRST),
      second:(row.detail??row.label).includes(process.env.CHEERS_PROBE_SECOND)})) };
  save(); return rows;
};
const begin = TurnSink.prototype.begin;
TurnSink.prototype.begin = function(...args) {
  const result = begin.apply(this, args); receipt.starts++; save(); return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) {
  const result = end.apply(this, args); receipt.ends++; save(); return result;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') receipt.requests++;
  if (event.type === 'approval.resolved') receipt.approvals.push({ taskId: event.taskId, outcome: event.outcome });
  if (event.type === 'tool.result') receipt.results.push({ taskId: event.taskId, success: event.success });
  const result = handle.call(this, event); save(); return result;
};
