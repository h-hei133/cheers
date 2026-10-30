import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { SessionCatalog } = await load('session/store/catalog/index.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { begins: 0, retires: 0, removals: 0, requests: 0, renders: 0 };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
for (const [method, counter] of [['beginBrowse', 'begins'], ['retireBrowse', 'retires'], ['forgetBrowse', 'removals']]) {
  const original = SessionCatalog.prototype[method];
  SessionCatalog.prototype[method] = function(...args) {
    const result = original.apply(this, args);
    receipt[counter]++; save(); return result;
  };
}
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args);
  receipt.renders++;
  receipt.snapshot = { title: this.picker?.title, filter: this.model.filter,
    current: this.model.current()?.id, loading: this.loading, searching: this.searching,
    pending: this.actionPending, subMode: this.subMode, failed: this.loadFailed || this.searchFailed,
    status: this.picker?.status?.(this.model.visible, this.model.filter),
    ids: this.model.visible.filter(row => !row.disabled).map(row => row.id),
    painted: [...new Set([...this.listRows.values()].flat().map(row => row.id))], rows: rows.length };
  save(); return rows;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
