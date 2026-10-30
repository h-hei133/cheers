import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { InteractiveSurface } = await load('presentation/tui/surface/view.js');
const { GitCommitIntent } = await load('workflow/git/operation/intent.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { requests: 0, renders: 0, toolCalls: 0, toolTranscriptReads: 0, totalSyncTranscriptReads: 0 };
let inTools = false;
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const render = InteractiveSurface.prototype.renderFrame;
InteractiveSurface.prototype.renderFrame = function(...args) {
  const frame = render.apply(this, args); receipt.renders++;
  receipt.snapshot = this.editor.snapshot(); save(); return frame;
};
const tools = GitCommitIntent.prototype.tools;
GitCommitIntent.prototype.tools = function(...args) {
  receipt.toolCalls++; inTools = true;
  try { return tools.apply(this, args); }
  finally { inTools = false; save(); }
};
const read = fs.readFileSync;
fs.readFileSync = function(target, ...args) {
  if (String(target).endsWith('/transcript.jsonl')) {
    receipt.totalSyncTranscriptReads++;
    if (inTools) receipt.toolTranscriptReads++;
  }
  return read.call(this, target, ...args);
};
syncBuiltinESMExports();
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
save();
