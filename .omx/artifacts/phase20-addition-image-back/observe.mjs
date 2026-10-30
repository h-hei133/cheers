import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { OverlayHost } = await load('cli/interactive/overlay.js');
const receipt = { renders: 0, networkAttempts: 0 };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(receipt));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
globalThis.fetch = async () => { receipt.networkAttempts++; save(); throw new Error('Fixture network disabled'); };
const render = OverlayHost.prototype.render;
OverlayHost.prototype.render = function(...args) {
  const rows = render.apply(this, args);
  receipt.overlay = { title: this.picker?.title, loading: this.loading,
    current: this.model.current()?.id, label: this.model.current()?.label,
    visible: this.model.visible.map(row => ({ id: row.id, label: row.label })) };
  save(); return rows;
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const render = this.view.renderFrame;
  this.view.renderFrame = (...params) => {
    const result = render.apply(this.view, params);
    receipt.renders++; receipt.draftLength = this.state.editor.getText().length;
    const session = this.options.runtimeContext.session;
    receipt.sessionId = session.id; receipt.lastTurnId = session.turns.at(-1)?.id;
    receipt.userMessages = session.turns.filter(turn => turn.role === 'user').length;
    receipt.composerImages = this.state.pastes.imagesIn(this.state.editor.getText()).length;
    save(); return result;
  };
  return start.apply(this, args);
};
