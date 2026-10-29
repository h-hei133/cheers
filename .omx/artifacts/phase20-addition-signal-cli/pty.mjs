import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/signal-cli');
const archive = path.join(root, '.omx/artifacts/phase20-addition-signal-cli');
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
const env = {...createQaPtyEnvironment(home,project),NODE_OPTIONS:'--max-old-space-size=768',
  CHEERS_PROBE_BUILD:built,CHEERS_PROBE_RECEIPT:path.join(scratch,'observe.json'),CHEERS_PROBE_DEVICE:path.join(scratch,'device.json')};
assert.equal(spawnSync('rtk',['git','init','-q'],{cwd:project,env,stdio:'ignore'}).status,0);
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:[],
  enableMcpTools:false,offline:true,cacheWarming:'off',provider:'openai-compatible',
  providerCredentials:{'openai-compatible':{apiKey:'synthetic-fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}}}));
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
const getSession = id => withProfile(profile,()=>new SessionManager().getSession(id));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const receipt={mode,signal,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,
  fixtures:1,messagesPerFixture:1,providerMode:'synthetic',status:'not-run',stages:[],checks:{}};
async function stage(label, explicit, sendSignal=false) {
  const observed=path.join(scratch,label+'-observe.json'),device=path.join(scratch,label+'-device.json');
  let output='',bytes=0,closed=false,overflow=false,timedOut=false;
  const child=spawn('python3',[path.join(root,'.omx/artifacts/phase20-addition-live-cli/relay.py'),'--',process.execPath,
    '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
    ...(explicit?['--session-id',fixtureIds[0]]:[]),'--no-context-files','--no-skills','--offline'],
    {cwd:project,env:{...env,CHEERS_PROBE_RECEIPT:observed,CHEERS_PROBE_DEVICE:device},detached:true});
  const close=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
  const observe=()=>{try{return JSON.parse(fs.readFileSync(observed));}catch{return {};} };
  for(const stream of [child.stdout,child.stderr]) {
    const decoder=new StringDecoder('utf8');stream.on('data',chunk=>{
      bytes+=chunk.length;if(bytes<=2*1024*1024)output+=decoder.write(chunk);
      else{overflow=true;child.kill('SIGTERM');}
    });
  }
  const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},20000);
  const record={label,status:'not-run'};receipt.stages.push(record);
  try {
    const until=Date.now()+10000;
    while(Date.now()<until&&!(output.includes('Ask anything, or / for commands')&&observe().session)) {
      assert(!closed,'closed-startup');assert(!overflow,'output-cap');await pause(25);
    }
    assert(observe().session,'startup-ready');
    const active=observe().session;
    record.sessionMatchesFixture=active.id===fixtureIds[0];record.turns=active.turns;record.userBlocks=active.userBlocks;
    record.fixtureHistoryVisible=output.includes('Saved signal fixture history');
    if(explicit) {
      assert(record.sessionMatchesFixture,'explicit-id');assert.equal(active.turns,1,'history-turn');
      assert.equal(active.userBlocks,1,'history-block');assert(record.fixtureHistoryVisible,'history-visible');
    } else {
      assert(!record.sessionMatchesFixture,'fresh-id');assert.equal(active.turns,0,'fresh-turns');
      assert.equal(active.userBlocks,0,'fresh-blocks');assert(!record.fixtureHistoryVisible,'fresh-no-history');
    }
    assert.equal(getCurrent()?.id,active.id,'selection');
    const stopped=Date.now();
    if(sendSignal) assert(child.kill(signal),'signal-delivered'); else child.stdin.write('\x04');
    record.shutdown=await Promise.race([close,pause(6000).then(()=>undefined)]);
    record.exitMs=Date.now()-stopped;
    assert.deepEqual(record.shutdown,{code:sendSignal?(signal==='SIGTERM'?143:129):0,signal:null});
    record.observation=observe();record.device=JSON.parse(fs.readFileSync(device));
    assert(record.device.cookedFlagsRestored,'cooked-flags');
    assert.equal(record.observation.requests,0,'zero-requests');
    record.retained=withProfile(profile,()=>new SessionManager().sessionExists(active.id));
    if(explicit){assert(record.retained,'fixture-retained');record.durableStatus=getSession(active.id)?.status;
      assert.equal(record.durableStatus,'terminated','saved-terminated');}
    else assert(!record.retained,'empty-fresh-discarded');
    record.status='passed';return record;
  } catch(error) {
    record.status='failed';record.failure=String(error.message).split('\n')[0];record.observation=observe();throw error;
  } finally {
    clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
      if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
    record.outputBytes=bytes;record.outputLimitExceeded=overflow;record.deadlineExceeded=timedOut;output='';
  }
}
try {
  await stage('signal-close',true,true);
  receipt.checks.catchableSignalPersistsTerminated=true;
  await stage('fresh-reopen',false);
  receipt.checks.ordinaryLaunchStartsFresh=true;
  await stage('explicit-resume',true);
  receipt.checks.explicitResumeRetainsHistory=true;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  receipt.checks.zeroRequests=receipt.stages.every(stage=>stage.observation.requests===0);
  assert(Object.values(receipt.checks).every(Boolean),'checks');receipt.status='passed';
} catch(error) {receipt.status='failed';receipt.failure=String(error.message).split('\n')[0];}
finally {fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);}
fs.writeFileSync(path.join(base,mode+'-'+signal+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
