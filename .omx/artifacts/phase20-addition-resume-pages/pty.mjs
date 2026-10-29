import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/resume-pages');
const archive = path.join(root, '.omx/artifacts/phase20-addition-resume-pages');
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
  providerMode:'synthetic',status:'not-run',checks:{},searchMs:[],pages:[],pageMs:[]};
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
const hasMore = () => observe().snapshot?.visible.some(row=>row.id==='action:more');
const ended = () => observe().snapshot?.status?.includes('End of this session page range.');
const ids = () => observe().snapshot.visible.filter(row=>fixtureIds.includes(row.id)).map(row=>row.id);
const sorted = values => [...values].sort();
function page(label) {
  const current = ids();
  assert.equal(new Set(current).size,current.length,'unique-page');
  receipt.pages.push({label,fixtureIndexes:current.map(id=>fixtureIds.indexOf(id)),
    paintedFixtureIndexes:observe().snapshot.painted.filter(id=>fixtureIds.includes(id)).map(id=>fixtureIds.indexOf(id)),
    hasMore:hasMore(),currentOccurrences:current.filter(id=>id===fixtureIds[0]).length});
  return current;
}
async function search(query, expectedCount, more) {
  const from=output.length,started=Date.now();child.stdin.write(query);
  await wait(()=>ready(query)&&ids().length===expectedCount&&(more?hasMore():ended()),'search');
  receipt.searchMs.push({queryCharacters:query.length,elapsed:Date.now()-started});
  assert(output.length>from,'search-paint');
}
async function focus(id) {
  const from=output.length;
  for(let step=0;step<50&&observe().snapshot.current!==id;step++) {
    const previous=observe().snapshot.current;child.stdin.write('\x1b[A');
    await wait(()=>observe().snapshot.current!==previous,'focus');
  }
  assert.equal(observe().snapshot.current,id,'key-focus');
  await wait(()=>observe().snapshot.painted.includes(id),'focused-painted');
  assert(output.length>from,'focus-paint');
}
async function next(query, count) {
  await focus('action:more');
  const opened=observe().opens,started=Date.now();child.stdin.write('\r');
  await wait(()=>observe().opens>opened&&ready(query)&&ids().length===count&&ended(),'next');
  receipt.pageMs.push({queryCharacters:query.length,elapsed:Date.now()-started});
  assert.equal(getCurrent()?.id,fixtureIds[0],'paging-does-not-resume');
}
async function clear(query, refresh=false) {
  child.stdin.write('\x7f'.repeat(query.length));
  await wait(()=>ready('')&&(refresh?observe().snapshot.visible.length===1&&observe().snapshot.current==='action:refresh':ids().length===40&&hasMore()),'clear');
}
try {
  await wait(()=>output.includes('Ask anything, or / for commands'),'startup');
  const opened=Date.now();child.stdin.write('/resume\r');
  await wait(()=>ready('')&&ids().length===40&&hasMore(),'open');
  receipt.openMs=Date.now()-opened;
  const first=page('base-first');
  assert(first.includes(fixtureIds[0]),'first-current');
  await next('',9);
  const second=page('base-second');
  assert.equal(second.filter(id=>id===fixtureIds[0]).length,1,'tail-current-once');
  assert.equal(second.filter(id=>id!==fixtureIds[0]&&first.includes(id)).length,0,'tail-noncurrent-disjoint');
  assert.deepEqual(sorted(new Set([...first,...second])),sorted(fixtureIds),'all-fixtures-covered');
  receipt.checks.basePagesCoverAllOnceExceptCurrent=true;
  receipt.checks.noNextAfterLastPage=!hasMore();
  const common='resume-fixture-';
  await search(common,40,true);
  const searchFirst=page('search-first');
  assert.deepEqual(searchFirst,first,'query-first-page');
  await next(common,9);
  const searchSecond=page('search-second');
  assert.equal(observe().snapshot.filter,common,'query-carried');
  assert.deepEqual(searchSecond,second,'query-second-page');
  receipt.checks.searchQueryCarriedToNext=true;
  await clear(common);
  assert.deepEqual(page('cleared-search-page'),first,'clear-search-restores-newest');
  receipt.checks.searchPageClearReturnsNewest=true;
  await next('',9);
  assert.deepEqual(page('base-second-revisited'),second,'base-second-repeat');
  const exact='resume-fixture-02';
  await search(exact,1,false);
  assert.equal(observe().snapshot.current,fixtureIds[2],'exact-search');
  await clear(exact,true);
  receipt.checks.continuedBaseClearOffersExplicitRefresh=true;
  assert.equal(getCurrent()?.id,fixtureIds[0],'clear-does-not-resume');
  const reopened=observe().opens,refreshed=Date.now();child.stdin.write('\r');
  await wait(()=>observe().opens>reopened&&ready('')&&ids().length===40&&hasMore(),'refresh');
  receipt.refreshMs=Date.now()-refreshed;
  assert.deepEqual(page('explicit-refresh-newest'),first,'explicit-refresh-first');
  receipt.checks.explicitRefreshReturnsNewest=true;
  await search(common,40,true);
  await next(common,9);
  await clear(common);
  const scopeOpened=observe().opens;child.stdin.write('\t');
  await wait(()=>observe().opens>scopeOpened&&observe().snapshot.scope==='all'&&ready('')&&ids().length===40&&hasMore(),'scope');
  assert.deepEqual(page('scope-after-cleared-search'),first,'scope-first');
  receipt.checks.clearedQueryDoesNotReturnOnScopeChange=true;
  await search(exact,1,false);
  const selected=observe().snapshot.current,switched=Date.now();child.stdin.write('\r');
  await wait(()=>getCurrent()?.id===selected&&!observe().snapshot?.title,'resume');
  receipt.resumeMs=Date.now()-switched;
  receipt.checks.exactSessionResumed=selected===fixtureIds[2];
  child.stdin.write('/resume\r');
  await wait(()=>ready('')&&ids().length===40&&hasMore()&&ids().includes(selected),'reopen');
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
  receipt.assertion=error.code==='ERR_ASSERTION'?String(error.message).split('\n')[0]:undefined;
  receipt.observation=observe();}
finally{clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
  if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
  receipt.outputBytes=bytes;receipt.outputLimitExceeded=overflow;receipt.deadlineExceeded=timedOut;
  output='';fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);}
fs.writeFileSync(path.join(base,mode+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
