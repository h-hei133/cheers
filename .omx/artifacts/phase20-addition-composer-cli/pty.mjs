import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/composer-cli');
const archive = path.join(root, '.omx/artifacts/phase20-addition-composer-cli');
fs.mkdirSync(base, { recursive: true, mode: 0o700 });
const build = checkBuild({root,dist:path.join(root,'packages/ts-shell/dist'),
  version:JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version,executablePolicy:'ignore'});
assert(build.ok, 'build');
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built,file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { setFilePersistenceEnabled } = await load('observability/structuredLogger.js');
setFilePersistenceEnabled(false);
const mode = process.argv[2] ?? 'regular';
assert(['regular','fullscreen'].includes(mode), 'mode');
const scratch = fs.mkdtempSync(path.join(base,'run-'));
const home = path.join(scratch,'home'), project = path.join(scratch,'project');
fs.mkdirSync(home);fs.mkdirSync(project);
const temp=path.join(scratch,'temp'),editor=path.join(scratch,'editor.py');fs.mkdirSync(temp);
const editedRaw='Edited public first\r\n\tEdited public middle 中文 😀\rEdited public last\r\n';
fs.writeFileSync(editor,`import sys, os, json, termios, hashlib
from pathlib import Path
file=Path(sys.argv[1])
flags=termios.tcgetattr(sys.stdin.fileno())[3]
required=termios.ICANON | termios.ECHO | termios.ISIG
record={"cookedFlags":(flags & required)==required,"inputDigest":hashlib.sha256(file.read_bytes()).hexdigest(),"isTty":sys.stdin.isatty()}
file.write_bytes(${JSON.stringify(editedRaw)}.encode("utf8"))
Path(os.environ["CHEERS_PROBE_EDITOR"]).write_text(json.dumps(record))
`);
const env = {...createQaPtyEnvironment(home,project),NODE_OPTIONS:'--max-old-space-size=768',
  CHEERS_PROBE_BUILD:built,CHEERS_PROBE_RECEIPT:path.join(scratch,'observe.json'),CHEERS_PROBE_DEVICE:path.join(scratch,'device.json'),CHEERS_PROBE_SCREEN:path.join(scratch,'screen.json'),
  CHEERS_PROBE_CONTROL:path.join(scratch,'size.json'),CHEERS_PROBE_INITIAL_ROW:'28',TMPDIR:temp,CHEERS_PROBE_EDITOR:path.join(scratch,'editor.json'),
  CHEERS_EDITOR:'rtk proxy python3 '+editor};
assert.equal(spawnSync('rtk',['git','init','-q'],{cwd:project,env,stdio:'ignore'}).status,0);
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:[],
  enableMcpTools:false,offline:true,cacheWarming:'off',provider:'openai-compatible',
  providerCredentials:{'openai-compatible':{apiKey:'synthetic-fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}}}));
const fixtureIds = withProfile(profile,()=>{
  const manager = new SessionManager(), ids=[];
  for(let index=0;index<1;index++){
    const session=manager.createNew(project);
    manager.addTurn(session.id,{id:'fixture-message',role:'user',content:'Small saved fixture '+index});
    manager.saveCompleted(session.id);
    manager.renameSession(session.id,'resume-fixture-'+String(index).padStart(2,'0'));
    ids.push(session.id);
  }
  return ids;
});
const getCurrent = () => withProfile(profile,()=>new SessionManager().getCurrentSessionForProject(project));
const configBefore = fs.readFileSync(path.join(profile.root,'config.json'));
let output='',bytes=0,closed=false,overflow=false,timedOut=false;
const child=spawn('python3',[path.join(archive,'relay.py'),'--',process.execPath,
  '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
  '--session-id',fixtureIds[0],'--no-context-files','--no-skills','--offline'],{cwd:project,env,detached:true});
const close = new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
const receipt={mode,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,fixtures:1,messagesPerFixture:1,
  providerMode:'synthetic',status:'not-run',steps:[],checks:{}};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>createHash('sha256').update(text).digest('hex');
const read=file=>{try{return JSON.parse(fs.readFileSync(file));}catch{return {};}};
const observe=()=>read(env.CHEERS_PROBE_RECEIPT),screen=()=>read(env.CHEERS_PROBE_SCREEN);
for(const stream of [child.stdout,child.stderr]){
  const decoder=new StringDecoder('utf8');stream.on('data',chunk=>{
    bytes+=chunk.length;if(bytes<=2*1024*1024)output+=decoder.write(chunk);
    else{overflow=true;child.kill('SIGTERM');}
  });
}
const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},45000);
async function wait(predicate,label){const until=Date.now()+10000;
  while(Date.now()<until){if(predicate())return;assert(!closed,'closed-'+label);assert(!overflow,'output-cap');await pause(25);}
  throw Error('timeout-'+label);
}
const raw='First public line\r\n\tMiddle public line 中文 😀\rFinal public line';
const clean=raw.replace(/\r\n?/g,'\n');
async function check(label,text,cursor,placeholders=0){
  const from=Date.now();
  await wait(()=>observe().source?.digest===hash(text)&&observe().source.cursor===cursor,'source-'+label);
  await pause(150);
  const current=observe(),device=screen(),source=current.source;
  assert(!source.containsCr,'normalized-cr');assert.equal(source.placeholders,placeholders,'placeholder-count');
  assert.equal(current.requests,0,'zero-model-turns');
  const expected=current.chrome.map(row=>row.trimEnd()),actual=device.display.map(row=>row.trimEnd());
  let top=-1;
  for(let row=0;row<=actual.length-expected.length;row++){
    if(expected.every((line,index)=>line===actual[row+index])){top=row;break;}
  }
  assert(top>=0,'chrome-matches-'+label);
  assert(current.caret,'application-caret');
  assert.deepEqual(device.cursor,{row:top+current.caret.row,column:current.caret.column},'physical-caret-'+label);
  assert(device.cursor.row>=0&&device.cursor.row<device.rows&&device.cursor.column<device.columns,'caret-in-window');
  receipt.steps.push({label,elapsedMs:Date.now()-from,sourceDigest:source.digest,cursor,lines:source.lines,
    placeholders,containsTab:source.containsTab,dimensions:current.dimensions,
    chromeMatches:true,physicalCaretMatches:true,physicalCursor:device.cursor});
}
let sequence=0;
async function resize(rows,columns,text,cursor,label){
  fs.writeFileSync(env.CHEERS_PROBE_CONTROL,JSON.stringify({rows,columns,sequence:++sequence}));
  await wait(()=>observe().dimensions?.rows===rows&&observe().dimensions?.columns===columns&&screen().sequence===sequence,'resize');
  await check(label,text,cursor);
}
try {
  await wait(()=>output.includes('Ask anything, or / for commands')&&observe().sessionId,'startup');
  assert.equal(observe().sessionId,fixtureIds[0]);
  await check('empty-start','',0);
  child.stdin.write('\x1b[200~'+raw+'\x1b[201~');
  await check('crlf-paste',clean,clean.length);
  child.stdin.write('\x1bs');await check('stash','',0);
  child.stdin.write('\x1bs');await check('restore',clean,clean.length);
  await resize(20,42,clean,clean.length,'narrow');
  child.stdin.write('\x1b[D\x1b[D');await check('move-left',clean,clean.length-2);
  child.stdin.write('\x1bs');await check('stash-caret','',0);
  child.stdin.write('\x1bs');await check('restore-caret',clean,clean.length-2);
  await resize(60,120,clean,clean.length-2,'wide');
  child.stdin.write('\x03');await check('clear','',0);
  const long=Array.from({length:9},(_,index)=>'Public held line '+index+' '+('word '.repeat(9))).join('\r\n');
  const held=long.replace(/\r\n?/g,'\n');
  child.stdin.write('\x1b[200~'+long+'\x1b[201~');
  await wait(()=>observe().source?.placeholders===1,'held');
  const marker=observe().source;
  assert.equal(marker.expandedDigest,hash(held),'held-payload');
  child.stdin.write('\x1b[D\x1b[D');await wait(()=>observe().source.cursor===marker.length-2,'inside-placeholder');
  child.stdin.write('\x1b[200~ignored clipboard\x1b[201~');
  await check('expand-placeholder',held,held.length);
  child.stdin.write('\x03');await check('final-clear','',0);
  const original='Original public draft';child.stdin.write(original);await check('before-editor',original,original.length);
  child.stdin.write('\x07');
  const edited=editedRaw.replace(/\r\n?/g,'\n').replace(/\n$/,'');await check('external-crlf-edit',edited,edited.length);
  const editorReceipt=read(env.CHEERS_PROBE_EDITOR);
  assert(editorReceipt.cookedFlags&&editorReceipt.isTty,'editor-cooked-terminal');
  assert.equal(editorReceipt.inputDigest,hash(original),'editor-received-original');
  assert.equal(fs.readdirSync(temp).length,0,'external-editor-temp-removed');
  child.stdin.write('\x1bs');await check('take-original',original,original.length);
  child.stdin.write('\x1bs');await check('take-edited',edited,edited.length);
  child.stdin.write('\x03');await check('clear-edited','',0);
  receipt.checks.externalEditorNormalizesCrAndKeepsOriginal=true;receipt.checks.externalEditorCookedHandoff=true;
  receipt.checks.externalEditorTempRemoved=true;
  receipt.checks.normalizedPasteAndStash=true;receipt.checks.cursorStableAcrossResize=true;
  receipt.checks.heldPasteExpandedWithoutDuplicate=true;receipt.checks.zeroModelRequests=observe().requests===0;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  const stopped=Date.now();child.stdin.write('\x04');receipt.shutdown=await Promise.race([close,pause(6000).then(()=>undefined)]);
  receipt.exitMs=Date.now()-stopped;assert.deepEqual(receipt.shutdown,{code:0,signal:null});
  receipt.device=read(env.CHEERS_PROBE_DEVICE);assert(receipt.device.cookedFlagsRestored,'cooked-input');
  receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure=String(error.message).split('\n')[0];
 receipt.observation=observe();receipt.screen=screen();
 receipt.diagnostic=output.split('\n').filter(line=>/^(Error|TypeError|SyntaxError|ReferenceError|ImportError|Traceback|AttributeError)/.test(line)).map(line=>line.replaceAll(scratch,'<fixture>').replaceAll(root,'<repository>')).slice(0,5);}
finally{
 clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
  if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
 receipt.outputBytes=bytes;receipt.outputLimitExceeded=overflow;receipt.deadlineExceeded=timedOut;output='';
 fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);
}
fs.writeFileSync(path.join(base,mode+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
