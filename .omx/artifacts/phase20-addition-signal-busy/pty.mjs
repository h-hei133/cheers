import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/signal-busy');
const archive = path.join(root, '.omx/artifacts/phase20-addition-signal-busy');
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
const mode = process.argv[2] ?? 'regular', signal = process.argv[3] ?? 'SIGTERM';
assert(['SIGTERM','SIGHUP'].includes(signal),'signal');
assert(['regular','fullscreen'].includes(mode), 'mode');
const scratch = fs.mkdtempSync(path.join(base,'run-'));
const home = path.join(scratch,'home'), project = path.join(scratch,'project');
fs.mkdirSync(home);fs.mkdirSync(project);
const env = {...createQaPtyEnvironment(home,project),CHEERS_PROVIDER_MODE:'real',NODE_OPTIONS:'--max-old-space-size=768',
  CHEERS_PROBE_BUILD:built,CHEERS_PROBE_RECEIPT:path.join(scratch,'observe.json'),CHEERS_PROBE_DEVICE:path.join(scratch,'device.json')};
assert.equal(spawnSync('rtk',['git','init','-q'],{cwd:project,env,stdio:'ignore'}).status,0);
let requests=0,readinessRequests=0,streamClosed=false;
const sockets=new Set();
const reasoning='Controlled public cancellation evidence';
const server=http.createServer((request,response)=>{
  request.resume();
  if(request.method==='GET'&&request.url==='/v1/models') {
    readinessRequests++;response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({data:[{id:'fixture'}]}));return;
  }
  assert.equal(request.method,'POST');assert.equal(request.url,'/v1/chat/completions');
  requests++;
  response.writeHead(200,{'content-type':'text/event-stream'});
  response.write('data: '+JSON.stringify({choices:[{delta:{reasoning_content:reasoning}}]})+'\n\n');
  response.on('close',()=>{streamClosed=true;});
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:[],
  enableMcpTools:false,offline:true,cacheWarming:'off',provider:'openai-compatible',maxTurns:1,maxOutputTokens:256,
  retryEnabled:false,retryMaxRetries:0,providerRetryMaxRetries:0,providerBodyTimeoutMs:10000,hooks:{},
  providerCredentials:{'openai-compatible':{apiKey:'synthetic-fixture',baseUrl:'http://127.0.0.1:'+address.port+'/v1',model:'fixture'}}}));
const fixtureIds = withProfile(profile,()=>{
  const manager = new SessionManager(), ids=[];
  for(let index=0;index<1;index++){
    const session=manager.createNew(project);
    manager.addTurn(session.id,{id:'fixture-message',role:'user',content:'Saved signal fixture history'});
    manager.saveCompleted(session.id);
    manager.renameSession(session.id,'resume-fixture-'+String(index).padStart(2,'0'));
    ids.push(session.id);
  }
  return ids;
});
const getCurrent = () => withProfile(profile,()=>new SessionManager().getCurrentSessionForProject(project));
const configBefore = fs.readFileSync(path.join(profile.root,'config.json'));
const getSession = () => withProfile(profile,()=>new SessionManager().getSession(fixtureIds[0]));
const getRecovery = () => withProfile(profile,()=>new SessionManager().getRecoverySnapshot(fixtureIds[0]));
const {hasUnfinishedSessionWork}=await load('session/recovery/work.js');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>createHash('sha256').update(text).digest('hex');
const prompt='Hold this small controlled request for cancellation';
const receipt={mode,signal,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,
  fixtures:1,messagesPerFixture:1,providerMode:'local HTTP fixture',status:'not-run',stages:[],checks:{}};
async function stage(label, resume) {
  const observed=path.join(scratch,label+'-observe.json'),device=path.join(scratch,label+'-device.json');
  let output='',bytes=0,closed=false,overflow=false,timedOut=false;
  const child=spawn('python3',[path.join(root,'.omx/artifacts/phase20-addition-live-cli/relay.py'),'--',process.execPath,
    '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
    ...(!resume?['--session-id',fixtureIds[0]]:[]),'--no-context-files','--no-skills','--offline'],
    {cwd:project,env:{...env,CHEERS_PROBE_RECEIPT:observed,CHEERS_PROBE_DEVICE:device},detached:true});
  const close=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
  const observe=()=>{try{return JSON.parse(fs.readFileSync(observed));}catch{return {};} };
  for(const stream of [child.stdout,child.stderr]) {
    const decoder=new StringDecoder('utf8');stream.on('data',chunk=>{
      bytes+=chunk.length;if(bytes<=2*1024*1024)output+=decoder.write(chunk);
      else{overflow=true;child.kill('SIGTERM');}
    });
  }
  const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},25000);
  const record={label,status:'not-run'};receipt.stages.push(record);
  async function wait(predicate,label) {
    const until=Date.now()+10000;
    while(Date.now()<until){if(predicate())return;assert(!closed,'closed-'+label);assert(!overflow,'output-cap');await pause(25);}
    throw Error('timeout-'+label);
  }
  try {
    await wait(()=>output.includes('Ask anything, or / for commands')&&observe().session,'startup');
    assert.equal(observe().session.id,fixtureIds[0],'same-session');
    assert.equal(getCurrent()?.id,fixtureIds[0],'selection');
    if(!resume) {
      child.stdin.write(prompt+'\r');
      await wait(()=>requests===1&&observe().requests===1&&observe().reasoningCharacters===reasoning.length,'stream-reasoning');
      assert(hasUnfinishedSessionWork(getRecovery()),'active-work-evidence');
      record.recoveryBeforeSignal={runPhase:getRecovery().runPhase,pendingPromptMatches:getRecovery().pendingPrompt===prompt};
    } else {
      record.recoveryNoticeVisible=output.includes('Resumed session '+fixtureIds[0]);
      assert(record.recoveryNoticeVisible,'recovery-notice');
      assert.equal(observe().session.thinkingDigest,hash(reasoning),'thinking-restored');
      assert.equal(observe().requests,0,'no-auto-replay');
      assert.equal(requests,1,'one-total-request');
    }
    const stopped=Date.now();
    if(!resume) assert(child.kill(signal),'signal-delivered'); else child.stdin.write('\x04');
    record.shutdown=await Promise.race([close,pause(6000).then(()=>undefined)]);record.exitMs=Date.now()-stopped;
    assert.deepEqual(record.shutdown,{code:!resume?(signal==='SIGTERM'?143:129):0,signal:null});
    record.observation=observe();record.device=JSON.parse(fs.readFileSync(device));
    assert(record.device.cookedFlagsRestored,'cooked-flags');
    const session=getSession(),recovery=getRecovery();
    assert(hasUnfinishedSessionWork(recovery),'unfinished-retained');
    assert.equal(session.status,'interrupted','interrupted-state');
    const savedReasoning=session.turns.filter(turn=>turn.role==='assistant').map(turn=>turn.reasoning?.text??'').join('');
    assert.equal(hash(savedReasoning),hash(reasoning),'reasoning-persisted');
    assert(session.turns.some(turn=>turn.role==='user'&&turn.content===prompt),'prompt-persisted');
    record.durable={status:session.status,runPhase:recovery.runPhase,interruptedKind:recovery.interruptedKind,
      terminalClassification:recovery.terminalClassification,terminalReason:recovery.terminalReason,
      promptRetained:true,reasoningCharacters:savedReasoning.length,reasoningDigest:hash(savedReasoning)};
    record.status='passed';
  } catch(error) {
    record.status='failed';record.failure=String(error.message).split('\n')[0];record.observation=observe();throw error;
  } finally {
    clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
      if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
    record.outputBytes=bytes;record.outputLimitExceeded=overflow;record.deadlineExceeded=timedOut;output='';
  }
}
try {
  await stage('busy-signal',false);
  const until=Date.now()+2000;while(!streamClosed&&Date.now()<until)await pause(25);
  assert(streamClosed,'transport-closed');
  receipt.checks.signalCancellationClosedTransport=true;
  await stage('ordinary-recovery',true);
  receipt.checks.recoveredSameInterruptedSession=true;
  receipt.checks.reasoningSavedAndRestored=true;
  receipt.checks.noAutomaticReplay=requests===1;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  assert(Object.values(receipt.checks).every(Boolean),'checks');receipt.status='passed';
} catch(error) {receipt.status='failed';receipt.failure=String(error.message).split('\n')[0];}
finally {
  for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
  fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);
}
receipt.requests=requests;receipt.readinessRequests=readinessRequests;receipt.responseStreamClosed=streamClosed;
fs.writeFileSync(path.join(base,mode+'-'+signal+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
