import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const load = file => import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD, file)));
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const { InteractiveMode } = await load('cli/interactive/interactiveMode.js');
const { Terminal } = await load('presentation/tui/terminal.js');
const { TurnSink } = await load('cli/interactive/turnSink.js');
const receipt = { requests: 0, reasoningCharacters: 0, physicalStops: 0, exitRestores: 0 };
const save = () => fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT, JSON.stringify(receipt));
const start = InteractiveMode.prototype.start;
InteractiveMode.prototype.start = function(...args) {
  const result = start.apply(this, args);
  receipt.session = { id: this.options.runtimeContext.session.id,
    turns: this.options.runtimeContext.session.turns?.length ?? 0,
    userBlocks: this.state.transcript.all().filter(block => block.kind === 'user').length,
    thinkingDigest: createHash('sha256').update(this.state.transcript.all().filter(block=>block.kind==='thinking').map(block=>block.text).join('')).digest('hex') };
  save(); return result;
};
for (const [name, field] of [['stop', 'physicalStops'], ['restoreSync', 'exitRestores']]) {
  const original = Terminal.prototype[name];
  Terminal.prototype[name] = function(...args) {
    const result = original.apply(this, args);
    receipt[field]++; save(); return result;
  };
}
const handle = TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent = function(event) {
  if (event.type === 'reasoning.delta') { receipt.reasoningCharacters+=event.delta.length; save(); }
  if (event.type === 'message.started') { receipt.requests++; save(); }
  return handle.call(this, event);
};
