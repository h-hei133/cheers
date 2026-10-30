import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { TaskRegistry } = await load('workflow/jobs/local/registry.js');
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { adoptions: 0, launches: 0, promotions: [], progress: [], jobs: [], subscriptions: 0, releases: 0, active: 0, starts: [], results: [], ends: 0 };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(record));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const adopt = TaskRegistry.prototype.adopt;
TaskRegistry.prototype.adopt = function(...args) {
  const task = adopt.apply(this, args); record.adoptions++;
  record.jobs.push({ id: task.id, state: task.state, pid: task.pid, startedAt: task.startedAt, adoptedNs: process.hrtime.bigint().toString() }); save(); return task;
};
const promote = TaskRegistry.prototype.promote;
TaskRegistry.prototype.promote = function(id) {
  const outcome = promote.call(this, id); record.promotions.push({ id, outcome, at: Date.now(), promotedNs: process.hrtime.bigint().toString() }); save(); return outcome;
};
const startJob = TaskRegistry.prototype.start;
TaskRegistry.prototype.start = function(...args) {
  const task = startJob.apply(this, args); record.launches++;
  record.jobs.push({ id: task.id, state: task.state }); save(); return task;
};
const get = TaskRegistry.prototype.get;
TaskRegistry.prototype.get = function(id) {
  const task = get.call(this, id), entry = record.jobs.find(job => job.id === id);
  if (entry && task) { entry.state = task.state; entry.pid = task.pid; entry.exitCode = task.exitCode; save(); }
  return task;
};
const subscribe = TaskRegistry.prototype.onEnded;
TaskRegistry.prototype.onEnded = function(listener) {
  record.subscriptions++; record.active++; save();
  const release = subscribe.call(this, task => { listener(task); save(); });
  let released = false;
  return () => { if (!released) { released = true; record.releases++; record.active--; save(); } release(); };
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
  if (event.type === 'tool.output' && event.toolName === 'taskWait') record.progress.push({ id: event.taskId,
    elapsed: Number(/(\d+)s elapsed/.exec(event.chunk)?.[1]), at: Date.now() });
  if (event.type === 'tool.started') record.starts.push({ name: event.toolName, id: event.taskId });
  if (event.type === 'tool.result') record.results.push({ name: event.toolName, success: event.success,
    cancelled: /cancelled/i.test(event.output ?? ''), timeout: /Wait limit reached after 1s/.test(event.output ?? ''),
    finished: /finished with exit code 0/.test(event.output ?? '') });
  const result = handle.call(this, event); save(); return result;
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
