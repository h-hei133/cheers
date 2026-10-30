import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { InputPreferences } = await load('cli/interactive/inputPreferences.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const record = { ends: 0, reloads: 0, renders: 0 };
const save = () => {
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT + '.next', JSON.stringify(record));
  fs.renameSync(process.env.CHEERS_PROBE_RECEIPT + '.next', process.env.CHEERS_PROBE_RECEIPT);
};
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const render = this.view.renderFrame;
  this.view.renderFrame = (...params) => {
    const frame = render.apply(this.view, params); record.renders++; record.draft = this.state.editor.getText(); record.toast = this.toast;
    record.stashKey = this.preferences.shortcut('tui.input.stash'); record.undoKey = this.preferences.shortcut('tui.editor.undo'); save(); return frame;
  };
  const result = start.apply(this, args); record.sessionId = this.options.runtimeContext.session.id; save(); return result;
};
const reload = InputPreferences.prototype.reload;
InputPreferences.prototype.reload = function(...args) { const result = reload.apply(this, args); record.reloads++; save(); return result; };
const end = TurnSink.prototype.end;
TurnSink.prototype.end = function(...args) { const result = end.apply(this, args); record.ends++; save(); return result; };
