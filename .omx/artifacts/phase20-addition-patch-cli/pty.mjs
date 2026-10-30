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
const root = process.cwd(), base = path.join(root, '.tmp/patch-cli');
const archive = path.join(root, '.omx/artifacts/phase20-addition-patch-cli');
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
const env = {...createQaPtyEnvironment(home,project),CHEERS_PROVIDER_MODE:'real',NODE_OPTIONS:'--max-old-space-size=768',
  CHEERS_PROBE_BUILD:built,CHEERS_PROBE_RECEIPT:path.join(scratch,'observe.json'),CHEERS_PROBE_DEVICE:path.join(scratch,'device.json')};
assert.equal(spawnSync('rtk',['git','init','-q'],{cwd:project,env,stdio:'ignore'}).status,0);
let requests=0,readinessRequests=0,attempt=0,attemptRequests=0;
const outside=path.join(scratch,'outside');fs.mkdirSync(outside);
const other=path.join(scratch,'other');fs.mkdirSync(other);
const target=path.join(outside,'saved.txt'),sibling=path.join(outside,'sibling.txt');
fs.writeFileSync(sibling,'preserve sibling');
const sockets=new Set();
const targets=number=>[path.join(outside,'first-'+number+'.txt'),path.join(other,'second-'+number+'.txt')];
const content='approved patch fixture\n';
const server=http.createServer((request,response)=>{
  request.resume();
  if(request.method==='GET'&&request.url==='/v1/models') {
    readinessRequests++;response.writeHead(200,{'content-type':'application/json'});
    response.end(JSON.stringify({data:[{id:'fixture'}]}));return;
  }
  assert.equal(request.method,'POST');assert.equal(request.url,'/v1/chat/completions');
  requests++;attemptRequests++;
  const name='apply_patch', [first,second]=targets(attempt);
  const args={input:'*** Begin Patch\n*** Add File: '+first+'\n+unselected fixture\n*** Add File: '+second+'\n+approved patch fixture\n*** End Patch'};
  response.writeHead(200,{'content-type':'application/json'});
  response.end(JSON.stringify({choices:[{message:attemptRequests===1
    ?{role:'assistant',content:'',tool_calls:[{id:'fixture-call-'+attempt,type:'function',function:{name,arguments:JSON.stringify(args)}}]}
    :{role:'assistant',content:'Fixture turn settled.'},finish_reason:attemptRequests===1?'tool_calls':'stop'}],
    usage:{prompt_tokens:12,completion_tokens:4,total_tokens:16}}));
});
server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();
const profile = createProfileContext({name:'probe',homeDir:home,env});
fs.writeFileSync(path.join(profile.root,'config.json'),JSON.stringify({tuiMode:mode,allowedTools:['apply_patch'],
  enableMcpTools:false,offline:true,cacheWarming:'off',provider:'openai-compatible',maxTurns:2,maxOutputTokens:256,
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
const getSession=()=>withProfile(profile,()=>new SessionManager().getSession(fixtureIds[0]));
const {captureOperationScope,readOperations}=await load('edit/recovery/operation/store.js');
const {ApprovalTrustPolicy}=await load('core/shell/approvalTrustPolicy.js');
const operations=()=>withProfile(profile,()=>readOperations(captureOperationScope({sessionId:fixtureIds[0],workspaceRoot:project})));
const grants=()=>withProfile(profile,()=>new ApprovalTrustPolicy().listGrants(project));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=text=>createHash('sha256').update(text).digest('hex');
const receipt={mode,buildId:build.manifest.buildId,inputsDigest:build.manifest.inputsDigest,
  providerMode:'local HTTP fixture',status:'not-run',attempts:[],checks:{}};
let output='',bytes=0,closed=false,overflow=false,timedOut=false;
const child=spawn('python3',[path.join(root,'.omx/artifacts/phase20-addition-live-cli/relay.py'),'--',process.execPath,
  '--import',path.join(archive,'observe.mjs'),path.join(root,'scripts/start.mjs'),'--project',project,'--profile','probe',
  '--session-id',fixtureIds[0],'--no-context-files','--no-skills','--offline'],
  {cwd:project,env:{...env,CHEERS_PROBE_TARGET:target,CHEERS_PROBE_FIRST:outside,CHEERS_PROBE_SECOND:other},detached:true});
const close=new Promise(resolve=>child.once('close',(code,signal)=>{closed=true;resolve({code,signal});}));
const observe=()=>{try{return JSON.parse(fs.readFileSync(env.CHEERS_PROBE_RECEIPT));}catch{return {};} };
for(const stream of [child.stdout,child.stderr]) {
  const decoder=new StringDecoder('utf8');stream.on('data',chunk=>{
    bytes+=chunk.length;if(bytes<=2*1024*1024)output+=decoder.write(chunk);
    else{overflow=true;child.kill('SIGTERM');}
  });
}
const deadline=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},45000);
async function wait(predicate,label) {
  const until=Date.now()+10000;
  while(Date.now()<until){if(predicate())return;assert(!closed,'closed-'+label);assert(!overflow,'output-cap');await pause(25);}
  throw Error('timeout-'+label);
}
async function run(number,key,allow) {
  attempt=number;attemptRequests=0;
  const started=Date.now(),results=observe().results.length,ends=observe().ends;
  const [first,second]=targets(number);
  child.stdin.write('Run isolated patch fixture '+number+'\r');
  await wait(()=>observe().pager?.active===true&&observe().pager.firstDeclared&&observe().pager.secondDeclared,'full-preview');
  assert(!fs.existsSync(first)&&!fs.existsSync(second),'preview-no-write');
  assert.equal(observe().results.length,results,'preview-no-result');
  child.stdin.write('\x1b');
  await wait(()=>!observe().pager?.active&&observe().snapshot?.title?.startsWith('Permission:')&&!observe().snapshot.loading,'approval');
  const approval=observe().snapshot;
  assert.deepEqual(approval.visible,['choose-groups','allow-once','deny'],'once-and-groups-options');
  assert(approval.painted.includes('allow-once')&&approval.painted.includes('deny'),'choices-painted');
  assert(approval.painted.includes('choose-groups'),'group-choice-painted');
  assert(!fs.existsSync(first)&&!fs.existsSync(second),'pending-no-write');
  assert.equal(observe().results.length,results,'pending-no-result');
  const pending=Date.now();child.stdin.write('a');await pause(150);
  assert(observe().snapshot?.title?.startsWith('Permission:'),'persistent-key-no-accept');
  assert.equal(observe().results.length,results,'persistent-key-no-result');
  assert(!fs.existsSync(first)&&!fs.existsSync(second),'persistent-key-no-write');
  let selectedId,skippedId;
  if(allow){
    child.stdin.write(key==='enter'?'\x1b[A\x1b[A\r':key);
    await wait(()=>observe().snapshot?.title==='Apply which groups?'&&!observe().snapshot.loading,'groups');
    const rows=observe().snapshot.groups;
    assert.equal(rows.length,2,'two-groups');
    assert(rows[0].first&&rows[1].second,'exact-group-targets');
    skippedId=rows[0].id;selectedId=rows[1].id;
    child.stdin.write(' \r');
    await wait(()=>observe().pager?.active&&observe().pager.secondDeclared&&!observe().pager.firstDeclared,'selected-preview');
    assert(!fs.existsSync(first)&&!fs.existsSync(second),'selected-preview-no-write');
    assert.equal(observe().results.length,results,'selected-preview-no-result');
    child.stdin.write('\x1b');await wait(()=>!observe().pager?.active&&observe().snapshot?.title?.startsWith('Permission:')
      &&!observe().snapshot.loading,'selected-approval');
    assert.deepEqual(observe().snapshot.visible,['allow-once','deny'],'selected-once-options');
  }
  child.stdin.write(allow?'y':'\x1b');
  await wait(()=>observe().results.length===results+1&&observe().ends>ends&&!observe().snapshot?.title&&!observe().pager?.active,'settled');
  const result=observe().results.at(-1),decision=observe().approvals.at(-1);
  assert.equal(result.success,allow,'tool-outcome');
  assert.equal(decision.outcome,allow?'approved':'denied','approval-outcome');
  const after=fs.existsSync(second)?fs.readFileSync(second,'utf8'):undefined;
  assert.equal(after,allow?content:undefined,'file-bytes');
  assert(!fs.existsSync(first),'unselected-never-written');
  assert.equal(fs.readFileSync(sibling,'utf8'),'preserve sibling','sibling-unchanged');
  assert.equal(grants().length,0,'no-persistent-grants');
  assert.equal(getSession().workspaceRoots?.length??0,0,'no-saved-roots');
  const tool=getSession().turns.filter(turn=>turn.role==='tool').at(-1);
  const operation=operations().find(entry=>entry.operationId===tool.metadata?.operationId);
  if(allow){assert.equal(tool.metadata?.status,'committed','native-commit-status');
    assert(operation,'native-operation-present');
    assert.equal(tool.metadata.operationId,operation.operationId,'exact-operation');
    assert.equal(operation.status,'committed','receipt-committed');
    assert.equal(operation.files.length,1,'single-file');
    assert.equal(path.join(operation.files[0].workspace.path,operation.files[0].path),second,'receipt-target');
    assert.deepEqual(operation.selection.selectedGroupIds,[selectedId],'exact-selected-group');
    assert.deepEqual(operation.selection.skippedGroupIds,[skippedId],'exact-skipped-group');
    assert.equal(operation.selection.selectedRevision,tool.metadata.selection.selectedRevision,'exact-preview-revision');}
  receipt.attempts.push({number,key,decision:allow?'allow-once':'deny',pendingMs:Date.now()-pending,
    elapsedMs:Date.now()-started,choices:approval.visible,canonicalTargetDeclared:true,pendingUnchanged:true,
    persistentKeyIgnored:true,toolSuccess:result.success,fileState:after===undefined?'absent':'exists',
    fileDigest:after===undefined?undefined:hash(after),operations:operations().length,
    nativeCommitStatus:allow?tool.metadata.status:undefined,
    unselectedAbsent:true,selectedGroups:allow?1:0,skippedGroups:allow?1:0,selectedPreviewBeforeApproval:allow});
}
try {
  await wait(()=>output.includes('Ask anything, or / for commands')&&observe().sessionId,'startup');
  assert.equal(observe().sessionId,fixtureIds[0],'session');
  await run(1,'g',true);
  await run(2,'4',true);
  await run(3,'enter',true);
  await run(4,'deny',false);
  assert.equal(operations().length,3,'three-committed-operations');
  receipt.checks.denialNeverWrites=true;
  receipt.checks.eachExternalCallRequiresAnswer=true;
  receipt.checks.noPersistentGrantOrRoot=true;
  receipt.checks.originalWriterCommittedSelectedGroupsOnly=true;
  receipt.checks.siblingUnchanged=true;
  receipt.checks.configUnchanged=fs.readFileSync(path.join(profile.root,'config.json')).equals(configBefore);
  const stopped=Date.now();child.stdin.write('\x04');
  receipt.shutdown=await Promise.race([close,pause(6000).then(()=>undefined)]);receipt.exitMs=Date.now()-stopped;
  assert.deepEqual(receipt.shutdown,{code:0,signal:null});
  receipt.device=JSON.parse(fs.readFileSync(env.CHEERS_PROBE_DEVICE));
  receipt.checks.cookedInputRestored=receipt.device.cookedFlagsRestored;
  assert(Object.values(receipt.checks).every(Boolean),'checks');receipt.status='passed';
} catch(error) {receipt.status='failed';receipt.failure=String(error.message).split('\n')[0];receipt.observation=observe();}
finally {
  clearTimeout(deadline);if(!closed){child.kill('SIGTERM');await Promise.race([close,pause(3000)]);
    if(!closed){try{process.kill(-child.pid,'SIGKILL');}catch{}await close;}}
  for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));
  receipt.requests=requests;receipt.readinessRequests=readinessRequests;receipt.outputBytes=bytes;
  receipt.outputLimitExceeded=overflow;receipt.deadlineExceeded=timedOut;output='';
  fs.rmSync(scratch,{recursive:true,force:true});receipt.scratchRemoved=!fs.existsSync(scratch);
}
fs.writeFileSync(path.join(base,mode+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));process.exitCode=receipt.status==='passed'?0:1;
