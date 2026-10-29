import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/resume-cli');
const archive = path.join(root, '.omx/artifacts/phase20-addition-resume-cli');
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
const env = {...createQaPtyEnvironment(home,project),NODE_OPTIONS:'--max-old-space-size=768',
  CHEERS_PROBE_BUILD:built,CHEERS_PROBE_RECEIPT:path.join(scratch,'observe.json'),CHEERS_PROBE_DEVICE:path.join(scratch,'device.json')};
assert.equal(spawnSync('rtk',['git','init','-q'],{cwd:project,env,stdio:'ignore'}).status,0);
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:[],
  enableMcpTools:false,offline:true,cacheWarming:'off',provider:'openai-compatible',
  providerCredentials:{'openai-compatible':{apiKey:'synthetic-fixture',baseUrl:'https://fixture.invalid/v1',model:'fixture'}}}));
const fixtureIds = withProfile(profile,()=>{
  const manager = new SessionManager(), ids=[];
  for(let index=0;index<48;index++){
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
const child=spawn('python3',[path.join(root,'.omx/artifacts/phase20-addition-live-cli/relay.py'),'--',process.execPath,
  '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
  '--session-id',fixtureIds[0],'--no-context-files','--no-skills','--offline'],{cwd:project,env,detached:true});
const close = new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
const receipt={mode,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,fixtures:48,messagesPerFixture:1,
  providerMode:'synthetic',status:'not-run',checks:{},searchMs:[]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const observe=()=>{try{return JSON.parse(fs.readFileSync(env.CHEERS_PROBE_RECEIPT));}catch{return {};} };
for(const stream of [child.stdout,child.stderr]){
  const decoder=new StringDecoder('utf8');stream.on('data',chunk=>{
    bytes+=chunk.length;if(bytes<=2*1024*1024)output+=decoder.write(chunk);
    else{overflow=true;child.kill('SIGTERM');}
  });
}
const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},45000);
async function wait(predicate,label){const until=Date.now()+10000;while(Date.now()<until){
  assert(!overflow,'output-cap');if(predicate())return;assert(!closed,'closed-'+label);await pause(25);
}throw Error('timeout-'+label);}
const ready=query=>{const s=observe().snapshot;return s?.title==='Resume session'&&s.filter===query&&!s.loading&&!s.searching&&!s.failed;};
async function search(query){const from=output.length,started=Date.now();child.stdin.write(query);await wait(()=>ready(query),'search');
  receipt.searchMs.push({queryCharacters:query.length,elapsed:Date.now()-started});assert(output.length>from,'search-paint');}
try{
  await wait(()=>output.includes('Ask anything, or / for commands'),'startup');
  const opened=Date.now();child.stdin.write('/resume\r');
  await wait(()=>ready('')&&observe().snapshot.visible.some(row=>row.id==='action:more'),'open');
  receipt.openMs=Date.now()-opened;
  assert(observe().snapshot.visible.some(row=>row.id==='action:more'),'paging-row');
  receipt.checks.pageActionVisible=true;
  await search('resume-fixture-02');
  const first=observe().snapshot.current;
  assert.equal(observe().snapshot.visible.length,1,'one-match');
  assert.equal(first,fixtureIds[2],'exact-match');
  child.stdin.write('\x7f');await wait(()=>ready('resume-fixture-0')&&observe().snapshot.visible.length===10,'broaden');
  const before=observe().snapshot.current;child.stdin.write('\x1b[B');
  await wait(()=>ready('resume-fixture-0')&&observe().snapshot.current!==before,'down');
  receipt.checks.arrowChangesFocus=true;
  child.stdin.write('\x7f'.repeat('resume-fixture-0'.length));
  await wait(()=>ready('')&&observe().snapshot.visible.some(row=>row.id==='action:more'),'clear');
  await search('missing-fixture-no-match');
  assert.equal(observe().snapshot.visible.length,0,'no-match');
  receipt.checks.confirmedNoMatch=true;
  child.stdin.write('\x7f'.repeat('missing-fixture-no-match'.length));
  await wait(()=>ready('')&&observe().snapshot.visible.length>1,'clear-no-match');
  await search('resume-fixture-02');
  const selected=observe().snapshot.current, switched=Date.now();child.stdin.write('\r');
  await wait(()=>getCurrent()?.id===selected,'resume');
  receipt.resumeMs=Date.now()-switched;
  receipt.checks.exactSessionResumed=selected===fixtureIds[2];
  child.stdin.write('/resume\r');await wait(()=>ready('')&&observe().snapshot.visible.some(row=>row.id===selected),'reopen');
  receipt.checks.reopenIncludesCurrent=true;
  child.stdin.write('\x1b');await wait(()=>!observe().snapshot?.title,'escape');
  const stopped=Date.now();child.stdin.write('\x04');
  receipt.shutdown=await Promise.race([close,pause(6000).then(()=>undefined)]);receipt.exitMs=Date.now()-stopped;
  assert.deepEqual(receipt.shutdown,{code:0,signal:null});
  receipt.device=JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE));
  receipt.checks.cookedInputRestored=receipt.device.cookedFlagsRestored;
  receipt.checks.zeroRequests=observe().requests===0;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  assert(Object.values(receipt.checks).every(Boolean),'checks');receipt.status='passed';
}catch(error){receipt.status='failed';receipt.failure=/^(timeout-|closed-)[\w-]+$/.test(error.message)?error.message:'assertion';
  receipt.observation=observe();}
finally{clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
  if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
  receipt.outputBytes=bytes;receipt.outputLimitExceeded=overflow;receipt.deadlineExceeded=timedOut;
  output='';fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);}
fs.writeFileSync(path.join(base,mode+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
