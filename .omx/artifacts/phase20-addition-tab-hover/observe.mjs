import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { OverlayHost } = await load('cli/interactive/overlay.js');
const { InteractiveSurface } = await load('presentation/tui/surface/view.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const { stripAnsi } = await load('presentation/tui/text/ansi.js');
const { defaultTheme } = await load('presentation/theme/theme.js');
const receipt = { requests: 0, renders: 0, mouse: [] };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(receipt));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args);
  receipt.renders++;
  receipt.snapshot = { width: args[0], height: args[1], category: this.picker?.navigation?.active,
    placement: this.picker?.navigation?.placement, title: this.picker?.title, current: this.model.current()?.id,
    loading: this.loading, filter: this.model.filter, hovered: this.hovered,
    chips: [...this.chipRows].flatMap(([row, spans]) => spans.map(span => ({ row, ...span }))),
    bandAvailable: Boolean(defaultTheme.bgOpen('statusBandBg')),
    bandRows: rows.flatMap((row, index) => defaultTheme.bgOpen('statusBandBg') && row.includes(defaultTheme.bgOpen('statusBandBg')) ? [index] : []),
    rowHashes: rows.map(row => createHash('sha256').update(row).digest('hex')),
    text: rows.map(stripAnsi).join('\n') };
  save(); return rows;
};
const frame = InteractiveSurface.prototype.renderFrame;
InteractiveSurface.prototype.renderFrame = function(...args) {
  const result = frame.apply(this, args);
  receipt.origin = this.choiceRegions.overlay?.top;
  save(); return result;
};
const pointer = OverlayHost.prototype.handlePointer;
OverlayHost.prototype.handlePointer = function(report, top) {
  const result = pointer.call(this, report, top);
  receipt.mouse.push({ kind: report.kind, row: report.row, column: report.column, top }); save(); return result;
};
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
save();
