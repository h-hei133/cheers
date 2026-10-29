import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { StringDecoder } from 'node:string_decoder';
import assert from 'node:assert/strict';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';
const root = process.cwd(), base = path.join(root, '.tmp/signal-approval');
const archive = path.join(root, '.omx/artifacts/phase20-addition-signal-approval');
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
let requests=0,readinessRequests=0;
const sockets=new Set();
const outside=path.join(scratch,'outside');fs.mkdirSync(outside);
const target=path.join(outside,'pending.txt'),sibling=path.join(outside,'sibling.txt');
fs.writeFileSync(sibling,'preserve sibling');
const server=http.createServer((request,response)=>{
  request.resume();
  if(request.method==='GET'&&request.url==='/v1/models') {
    readinessRequests++;response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({data:[{id:'fixture'}]}));return;
  }
  assert.equal(request.method,'POST');assert.equal(request.url,'/v1/chat/completions');
  requests++;
  response.writeHead(200,{'content-type':'application/json'});
  response.end(JSON.stringify({choices:[{message:{role:'assistant',content:'',tool_calls:[{
    id:'fixture-pending-call',type:'function',function:{name:'write',arguments:JSON.stringify({path:target,content:'must remain unwritten'})}
  }]},finish_reason:'tool_calls'}],usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16}}));
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:['write'],
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
const {captureOperationScope,readOperations}=await load('edit/recovery/operation/store.js');
const {ApprovalTrustPolicy}=await load('core/shell/approvalTrustPolicy.js');
const operations=()=>withProfile(profile,()=>readOperations(captureOperationScope({sessionId:fixtureIds[0],workspaceRoot:project})));
const grants=()=>withProfile(profile,()=>new ApprovalTrustPolicy().listGrants(project));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const prompt='Hold this isolated write for an explicit answer';
const receipt={mode,signal,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,
  fixtures:1,messagesPerFixture:1,providerMode:'local HTTP fixture',status:'not-run',stages:[],checks:{}};
async function stage(label, resume) {
  const observed=path.join(scratch,label+'-observe.json'),device=path.join(scratch,label+'-device.json');
  let output='',bytes=0,closed=false,overflow=false,timedOut=false;
  const child=spawn('python3',[path.join(root,'.omx/artifacts/phase20-addition-live-cli/relay.py'),'--',process.execPath,
    '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
    ...(!resume?['--session-id',fixtureIds[0]]:[]),'--no-context-files','--no-skills','--offline'],
    {cwd:project,env:{...env,CHEERS_PROBE_RECEIPT:observed,CHEERS_PROBE_DEVICE:device,CHEERS_PROBE_TARGET:target},detached:true});
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
    await wait(()=>output.includes('Ask anything, or / for commands')&&observe().sessionId,'startup');
    assert.equal(observe().sessionId,fixtureIds[0],'same-session');
    assert.equal(getCurrent()?.id,fixtureIds[0],'selection');
    if(!resume) {
      child.stdin.write(prompt+'\r');
      await wait(()=>requests===1&&observe().requests===1&&observe().snapshot?.title?.startsWith('Permission:')&&!observe().snapshot.loading,'approval');
      assert.deepEqual(observe().snapshot.visible,['allow-once','deny'],'once-only-options');
      assert(observe().snapshot.targetDeclared&&observe().snapshot.directoryDeclared,'canonical-target-declared');
      assert(observe().snapshot.painted.includes('allow-once')&&observe().snapshot.painted.includes('deny'),'choices-painted');
      assert.equal(observe().results.length,0,'pending-no-result');
      assert.equal(operations().length,0,'pending-no-operation');
      assert(!fs.existsSync(target),'pending-no-write');
      record.approvalPending=true;
      assert(hasUnfinishedSessionWork(getRecovery()),'active-work-evidence');
      record.recoveryBeforeSignal={runPhase:getRecovery().runPhase,pendingPromptMatches:getRecovery().pendingPrompt===prompt};
    } else {
      record.recoveryNoticeVisible=output.includes('Resumed session '+fixtureIds[0]);
      assert(record.recoveryNoticeVisible,'recovery-notice');
      assert.equal(observe().requests,0,'no-auto-replay');
      assert.equal(requests,1,'one-total-request');
      assert(!observe().snapshot?.title?.startsWith('Permission:'),'no-restored-approval');
    }
    const stopped=Date.now();
    if(!resume) assert(child.kill(signal),'signal-delivered'); else child.stdin.write('\x04');
    record.shutdown=await Promise.race([close,pause(12000).then(()=>undefined)]);record.exitMs=Date.now()-stopped;
    assert.deepEqual(record.shutdown,{code:!resume?(signal==='SIGTERM'?143:129):0,signal:null});
    record.observation=observe();record.device=JSON.parse(fs.readFileSync(device));
    assert.equal(record.observation.overlayActive,false,'approval-owner-retired');
    assert(record.device.cookedFlagsRestored,'cooked-flags');
    const session=getSession(),recovery=getRecovery();
    assert(hasUnfinishedSessionWork(recovery),'unfinished-retained');
    assert.equal(session.status,'interrupted','interrupted-state');
    assert(session.turns.some(turn=>turn.role==='user'&&turn.content===prompt),'prompt-persisted');
    assert(!fs.existsSync(target),'no-write-after-exit');
    assert.equal(operations().length,0,'no-operation-after-exit');
    assert.equal(grants().length,0,'no-grants');
    assert.equal(session.workspaceRoots?.length??0,0,'no-roots');
    assert.equal(fs.readFileSync(sibling,'utf8'),'preserve sibling','sibling-unchanged');
    assert(!record.observation.results.some(result=>result.success),'no-success-result');
    record.durable={status:session.status,runPhase:recovery.runPhase,interruptedKind:recovery.interruptedKind,
      terminalClassification:recovery.terminalClassification,terminalReason:recovery.terminalReason,
      promptRetained:true,operations:operations().length,targetAbsent:true,noPersistentAuthority:true};
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
  await stage('approval-signal',false);
  receipt.checks.signalSettledUnansweredApproval=true;
  await stage('ordinary-recovery',true);
  receipt.checks.recoveredSameInterruptedSession=true;
  receipt.checks.noWriteOperationOrPersistentAuthority=true;
  receipt.checks.noAutomaticReplay=requests===1;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  assert(Object.values(receipt.checks).every(Boolean),'checks');receipt.status='passed';
} catch(error) {receipt.status='failed';receipt.failure=String(error.message).split('\n')[0];}
finally {
  for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
  fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);
}
receipt.requests=requests;receipt.readinessRequests=readinessRequests;
fs.writeFileSync(path.join(base,mode+'-'+signal+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
