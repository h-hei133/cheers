import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { opens: 0, frames: [], requests: 0 };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const open = OverlayHost.prototype.open;
OverlayHost.prototype.open = function(...args) {
  receipt.opens++;
  return open.apply(this, args);
};
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args);
  receipt.snapshot = { title: this.picker?.title, filter: this.model.filter,
    scope: this.picker?.chips?.active,
    current: this.model.current()?.id, loading: this.loading, searching: this.searching,
    failed: this.loadFailed || this.searchFailed,
    status: this.picker?.status?.(this.model.visible, this.model.filter),
    visible: this.model.visible.filter(row => !row.disabled).map(row => ({ id: row.id, label: row.label })),
    painted: [...new Set([...this.listRows.values()].flat().map(row => row.id))], rows: rows.length };
  receipt.frames.push({ opens: receipt.opens, title: receipt.snapshot.title,
    filter: receipt.snapshot.filter, current: receipt.snapshot.current });
  receipt.frames = receipt.frames.slice(-12); save(); return rows;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
