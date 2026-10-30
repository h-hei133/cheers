import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const { stripAnsi } = await load('presentation/tui/text/ansi.js');
const receipt = { requests: 0, renders: 0 };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args), current = this.model.current()?.id;
  receipt.renders++;
  receipt.snapshot = { width: args[0], height: args[1], placement: this.picker?.navigation?.placement,
    category: this.picker?.navigation?.active, categoryFocused: this.picker?.navigation?.focused, title: this.picker?.title, current, filter: this.model.filter,
    loading: this.loading, searching: this.searching, pending: this.actionPending, failed: this.loadFailed || this.searchFailed,
    status: this.picker?.status?.(this.model.visible, this.model.filter),
    detail: this.picker?.detail?.(current), input: this.picker?.input?.readOnly ? this.picker.input.initial : undefined,
    text: rows.map(stripAnsi).join('\n') };
  save(); return rows;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
save();
