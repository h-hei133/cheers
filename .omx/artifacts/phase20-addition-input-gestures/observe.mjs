import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { InteractiveSurface } = await load('presentation/tui/surface/view.js');
const { Pointer } = await load('cli/interactive/pointer.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { requests: 0, renders: 0, pointers: [] };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const render = InteractiveSurface.prototype.renderFrame;
InteractiveSurface.prototype.renderFrame = function(...args) {
  const frame = render.apply(this, args);
  receipt.renders++;
  receipt.snapshot = { ...this.editor.snapshot(), width: args[0].columns,
    geometry: this.composerGeometry(), fullScreen: frame.fullScreen };
  save(); return frame;
};
const pointer = Pointer.prototype.handle;
Pointer.prototype.handle = function(report) {
  const offset = pointer.call(this, report);
  receipt.pointers.push({ kind: report.kind, offset }); save(); return offset;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
save();
