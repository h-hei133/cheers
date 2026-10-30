import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { requests: 0, starts: 0, ends: 0, approvals: [], results: [], scopes: [], readOpens: [], enumerations: 0 };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const outside=process.env.CHEERS_PROBE_OUTSIDE;
const nativeOpen=fs.promises.open;
fs.promises.open=async function(...args) {
  const name=typeof args[0]==='string'?path.resolve(args[0]):undefined;
  if(name===outside||name?.startsWith(outside+path.sep)) {
    receipt.readOpens.push({kind:name===outside?'directory':'file',
      target:name===process.env.CHEERS_PROBE_TARGET?'target':name===process.env.CHEERS_PROBE_SIBLING?'sibling':'other'});save();
  }
  return nativeOpen.apply(this,args);
};
const nativeOpendir=fs.promises.opendir;
fs.promises.opendir=async function(...args) {
  let target;try{target=fs.realpathSync(args[0]);}catch{}
  if(target===outside){receipt.enumerations++;save();}
  return nativeOpendir.apply(this,args);
};
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
    siblingDeclared: this.model.visible.some(row => row.detail?.includes(process.env.CHEERS_PROBE_SIBLING)),
    painted: [...new Set([...this.listRows.values()].flat().map(row => row.id))] };
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
