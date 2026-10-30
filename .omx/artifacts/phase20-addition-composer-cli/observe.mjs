import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const load=file=>import(pathToFileURL(path.join(process.env.CHEERS_PROBE_BUILD,file)));
const {setFilePersistenceEnabled}=await load('observability/structuredLogger.js');setFilePersistenceEnabled(false);
const {InteractiveMode}=await load('cli/interactive/interactiveMode.js');
const {InteractiveSurface}=await load('presentation/tui/surface/view.js');
const {TUI}=await load('presentation/tui/render/engine.js');
const {cursorTarget}=await load('presentation/tui/render/paint.js');
const {stripAnsi}=await load('presentation/tui/text/ansi.js');
const {TurnSink}=await load('cli/interactive/turnSink.js');
const hash=text=>createHash('sha256').update(text).digest('hex');
let host,lastFrame,frames=0,requests=0;
const start=InteractiveMode.prototype.start;
InteractiveMode.prototype.start=function(...args){host=this;return start.apply(this,args);};
const compose=InteractiveSurface.prototype.renderFrame;
InteractiveSurface.prototype.renderFrame=function(...args){const frame=compose.apply(this,args);
 if(host&&this===host.view)lastFrame={...frame,dimensions:args[0],layout:args[1]};return frame;};
const render=TUI.prototype.renderNow;
TUI.prototype.renderNow=function(...args){const result=render.apply(this,args);
 if(host&&this===host.tui&&lastFrame){
  const source=host.state.editor.snapshot(),expanded=host.state.pastes.expand(source.text);
  const rows=lastFrame.chromeRows??[],caret=cursorTarget(rows,0,lastFrame.dimensions.rows);
  frames++;
  fs.writeFileSync(process.env.CHEERS_PROBE_RECEIPT,JSON.stringify({sessionId:host.options.runtimeContext.session.id,
   frames,requests,dimensions:lastFrame.dimensions,layout:lastFrame.layout,chrome:rows.map(stripAnsi),caret,
   source:{digest:hash(source.text),expandedDigest:hash(expanded),length:source.text.length,cursor:source.cursor,
    lines:source.text.split('\n').length,containsCr:source.text.includes('\r'),containsTab:source.text.includes('\t'),
    placeholders:(source.text.match(/\[#\d+ pasted [^\]]*\]/g)??[]).length}}));
 }
 return result;
};
const handle=TurnSink.prototype.handleEvent;
TurnSink.prototype.handleEvent=function(event){if(event.type==='message.started')requests++;return handle.call(this,event);};
