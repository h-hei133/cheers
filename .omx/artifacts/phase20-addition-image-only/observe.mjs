import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { imageData } from '../phase20-addition-paste-retention/fixture.mjs';
const text = '';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { ends: 0, renders: 0, imageHostInjections: 0, pressureIssuances: 0 };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(record));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const render = this.view.renderFrame;
  this.view.renderFrame = (...params) => {
    const frame = render.apply(this.view, params);
    const store = this.state.pastes;
    if (process.env.CHEERS_PROBE_PHASE === 'submit' && !this.state.editor.getText() && this.stash.hasDraft && record.pressureIssuances === 0) {
      // Tiny in-process pressure uses the actual store; these are not keyboard events.
      for (let index = 0; index < 1100; index++) store.hold('bounded identity filler ' + index);
      record.pressureIssuances = 1100;
      record.pressure = { signatures: store.issued.size, payloads: store.order.size, payloadBytes: store.heldBytes };
    }
    const snapshot = this.state.editor.snapshot(), images = store.imagesIn(snapshot.text);
    record.renders++; record.draftLength = snapshot.text.length;
    record.draftHash = createHash('sha256').update(snapshot.text).digest('hex'); record.cursor = snapshot.cursor;
    record.expandedTextMatches = store.expand(snapshot.text) === text;
    record.imageMatches = images.length === 1 && images[0].data === imageData && images[0].mimeType === 'image/png';
    record.unresolved = store.unresolved(snapshot.text).length;
    record.insideExpansionMatches = store.expansionAt(snapshot.text, 1)?.text === text;
    record.toast = this.toast; save(); return frame;
  };
  const result = start.apply(this, args); record.sessionId = this.options.runtimeContext.session.id; save(); return result;
};
const { InputPreferences } = await load('cli/interactive/inputPreferences.js');
const clipboard = InputPreferences.prototype.attachClipboardImage;
InputPreferences.prototype.attachClipboardImage = function(...args) {
  if (process.env.CHEERS_PROBE_PHASE !== 'submit') return clipboard.apply(this, args);
  record.imageHostInjections++; this.host.attachImage({ bytes: Buffer.from(imageData, 'base64'), mimeType: 'image/png' }); save();
};
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
