import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {switchActiveSession, type ShellRuntimeContext} from '../../../core/shell/runtimeContext.js';
import type {ShellSessionRuntime} from '../../../core/shell/sessionRuntime.js';
import {configurationAdmission, initialConfiguration} from '../../../core/shell/configuration.js';
import {ShellCommandRuntime} from '../../../core/shell/command.js';
import {HookDispatcher} from '../../../core/hooks/hookDispatcher.js';
import {getRuntimeConfig} from '../../../config/runtimeConfig.js';
import {SessionManager} from '../../../session/SessionManager.js';
import {catalogContributions, registerCatalogContribution} from '../../../core/catalog/contributions.js';
import {ExtensionService} from '../../../extensions/service.js';
import { SubmissionQueue } from '../../interactive/inputQueue.js';
import { attachSubmissionQueue } from '../inputQueue.js';
import { routeSlashCommand } from '../../../core/commands/slashRouter.js';
import {bindSessionSurface} from '../session/surface.js';
import {bindExtensionUiFor, extensionHostFor, installExtensionHost} from './host.js';
import {captureExtensionRuntimeFor, closeExtensionsFor, extensionCommandFor, installExtensionRuntime, startExtensionsFor} from '../extensions.js';
import { scanCliArgs } from '../../options/argv.js';
import { cliExtensionArguments, type CliExtensionArguments } from '../../options/extensions.js';

let root: string, context: ShellRuntimeContext, runtime: ShellSessionRuntime, manager: SessionManager;
let busy = false;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, {recursive:true}); root = fs.mkdtempSync(path.join(temporary, 'extension-reload-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  manager = new SessionManager(); const session = manager.createNew(root);
  const seed = {session, cwd:root, projectRoot:root, originalCwd:root, runtimeConfig:getRuntimeConfig(root)};
  context = {...seed, configuration:initialConfiguration(seed)} as ShellRuntimeContext;
  busy = false; const commands = new ShellCommandRuntime();
  runtime = {commands, input:() => undefined, isRunning:() => busy || Boolean(commands.current), getPermissionScope:() => 'ask',
    cancelAndWait:vi.fn(async () => { if (commands.current) throw new Error('A command cannot settle itself.'); }),
    executePrompt:vi.fn(async () => 'answer')} as unknown as ShellSessionRuntime;
});
afterEach(async () => {cleanups.splice(0).forEach(fn => fn()); await closeExtensionsFor(context).catch(() => {}); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root,{recursive:true,force:true});});
function install(args?: CliExtensionArguments) {
  installExtensionRuntime(context,runtime,() => ({sessionId:context.session.id,workspaceRoot:root,hooks:new HookDispatcher(),emit(){},permissionScope:'ask'}),manager,undefined,args);
}
function reload(signal?: AbortSignal) {return extensionCommandFor(context)('plugin',['reload'],{cwd:root,projectRoot:root,sessionId:context.session.id,signal});}

it.each(['different entry', 'retargeted symlink'] as const)('withholds invoked values on reload with a %s', async change => {
  const first = path.join(root, 'owner.ts'), second = path.join(root, 'successor.ts'), link = path.join(root, 'entry.ts');
  fs.writeFileSync(first, `export default api => {
    api.registerFlag({name:'label', default:'FIRST_DEFAULT'});
    api.registerCommand({name:'show-label', execute: () => ({kind:'local', output:api.getFlag('label')})});
  };`);
  fs.writeFileSync(second, `export default api => {
    try { api.registerFlag({name:'label', default:'SECOND_DEFAULT'}); } catch {}
    if (api.getFlag('label') !== undefined) throw new Error('Successor observed an invoked value.');
    api.registerCommand({name:'adopted-label', execute: () => ({kind:'local', output:'unexpected'})});
  };`);
  if (change === 'retargeted symlink') fs.symlinkSync(first, link);
  context.cliExtensionPaths = [change === 'retargeted symlink' ? link : first];
  const finalize = vi.fn();
  install(cliExtensionArguments(scanCliArgs(['--label=FIRST_EXPLICIT']).unresolved, finalize));
  await startExtensionsFor(context);
  const original = catalogContributions(root, context.session.id).flatMap(entry => entry.commands)[0]!;
  expect(await original.execute([], { cwd: root, sessionId: context.session.id })).toMatchObject({output:'FIRST_EXPLICIT'});
  expect((await reload()).output).toContain('reloaded');
  expect(finalize).toHaveBeenCalledTimes(2);
  if (change === 'retargeted symlink') { fs.unlinkSync(link); fs.symlinkSync(second, link); }
  else context.cliExtensionPaths = [second];
  expect((await reload()).output).toContain('unknown');
  expect(finalize).toHaveBeenCalledTimes(2);
  expect(catalogContributions(root, context.session.id)).toEqual([]);
});

it('never cancels a successor command when a captured original runtime shuts down and closes', async () => {
  install(); await startExtensionsFor(context); const original = captureExtensionRuntimeFor(context)!;
  install(); await startExtensionsFor(context);
  let release!: () => void; const hold = new Promise<void>(resolve => {release = resolve;});
  const pending = runtime.commands.run(async () => hold, 'extension-reload'); const command = runtime.commands.current!;
  try {
    await original.shutdown('quit'); await original.close();
    expect(command.controller.signal.aborted).toBe(false); expect(runtime.cancelAndWait).not.toHaveBeenCalled();
  } finally {release(); await pending;}
});

it('reloads file contributions after old shutdown and binds successor UI before start', async () => {
  const file = path.join(root,'event.ts');
  fs.writeFileSync(file,"export default api => { api.registerCommand({name:'old-loaded',kind:'local',execute:async () => ({kind:'local',output:(await api.getCommands()).join(',')})}); };");
  context.cliExtensionPaths = [file]; install();
  const original = context.session, oldHost = extensionHostFor(context); const events: string[] = [];
  cleanups.push(registerCatalogContribution({root,sessionId:original.id,commands:[],tools:[],skills:() => [],onEvent:async (event,payload) => {
    if (event === 'session_shutdown') events.push('shutdown:' + (payload as {reason:string}).reason);
    if (event === 'session_start' && (payload as {reason:string}).reason === 'reload') {events.push('start:reload'); expect(await extensionHostFor(context)!.ui!.confirm!('Reload', 'Bound')).toBe(true);}
  }}));
  cleanups.push(bindSessionSurface(context,() => {events.push('bind'); bindExtensionUiFor(context,{confirm:async () => true});}));
  await startExtensionsFor(context);
  const old = catalogContributions(root,context.session.id).flatMap(entry => entry.commands).find(command => command.name === 'old-loaded')!;
  fs.writeFileSync(file,"export default api => { api.registerCommand({name:'new-loaded',kind:'local',execute:async () => ({kind:'local',output:'new'})}); };");
  const result = await reload();
  expect(events).toEqual(['shutdown:reload','bind','start:reload']); expect(result.output).toContain('reloaded');
  expect(context.session).toBe(original); expect(extensionHostFor(context)).not.toBe(oldHost);
  expect(catalogContributions(root,original.id).flatMap(entry => entry.commands).map(command => command.name)).toEqual(['new-loaded']);
  await expect(old.execute([], {cwd:root,sessionId:original.id})).rejects.toThrow();
});

it('waits for old shutdown before retiring and starting the successor', async () => {
  const events: string[] = []; let finish!: () => void;
  const held = new Promise<void>(resolve => {finish=resolve;});
  install(); cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async (event,payload) => {
    if (event === 'session_shutdown') {events.push('shutdown:' + (payload as {reason:string}).reason); await held;}
    if (event === 'session_start' && (payload as {reason:string}).reason === 'reload') events.push('start:reload');
  }}));
  await startExtensionsFor(context); const pending=reload();
  try {await new Promise(resolve => setImmediate(resolve)); expect(events).toEqual(['shutdown:reload']);}
  finally {finish(); await pending;}
  expect(events).toEqual(['shutdown:reload','start:reload']);
});

it('refuses reload while another session operation is running without invalidating registrations', async () => {
  install(); await startExtensionsFor(context); const invalidate=vi.spyOn(ExtensionService.prototype,'invalidate'); busy=true;
  const result=await reload(); expect(result.output).toContain('running'); expect(invalidate).not.toHaveBeenCalled();
});

it('refuses an already cancelled reload without retiring the original host', async () => {
  install(); await startExtensionsFor(context); const host=extensionHostFor(context), invalidate=vi.spyOn(ExtensionService.prototype,'invalidate');
  const controller=new AbortController(); controller.abort(); const result=await reload(controller.signal);
  expect(result.output.toLowerCase()).toContain('cancel'); expect(invalidate).not.toHaveBeenCalled(); expect(extensionHostFor(context)).toBe(host);
});

it('keeps the same runtime blocked when accepted configuration changes during old shutdown', async () => {
  let finish!: () => void, entered!: () => void;
  const held=new Promise<void>(resolve => {finish=resolve;}), reached=new Promise<void>(resolve => {entered=resolve;});
  install(); cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async event => {
    if (event==='session_shutdown') {entered(); await held;}
  }}));
  await startExtensionsFor(context); const pending=reload();
  await reached; context.configuration=initialConfiguration(context); finish(); const result=await pending;
  expect(result.output).toContain('unknown'); expect(configurationAdmission(context)()).toContain('not verified');
});

it('reports withheld installed capabilities instead of clean reload success', async () => {
  install(); await startExtensionsFor(context);
  const activation=vi.spyOn(ExtensionService.prototype as unknown as {activate():void},'activate')
    .mockImplementation(function(this:ExtensionService) {this.errors.push('Extension state unavailable; all capabilities withheld.');});
  try { const result=await reload(); expect(result.output).toContain('withheld'); }
  finally {activation.mockRestore();}
});

it('refuses a competing extension host installed while successor resources finish loading', async () => {
  const file=path.join(root,'event.ts'); context.cliExtensionPaths=[file];
  fs.writeFileSync(file,"export default api => api.registerCommand({name:'original',kind:'local',execute:async () => ({kind:'local',output:'old'})});");
  install(); await startExtensionsFor(context);
  fs.writeFileSync(file,"export default async api => { await api.appendEntry('reenter', {}); api.registerCommand({name:'successor',kind:'local',execute:async () => ({kind:'local',output:'new'})}); };");
  const capture=manager.captureReportWriter.bind(manager);
  vi.spyOn(manager,'captureReportWriter').mockImplementation(sessionId => {
    installExtensionHost(context,runtime,manager); return capture(sessionId);
  });
  const result=await reload(); expect(result.output).toContain('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it('joins duplicate reload requests and joins every old cleanup before loading the next file', async () => {
  const file=path.join(root,'event.ts'); context.cliExtensionPaths=[file];
  fs.writeFileSync(file,"export default api => api.registerCommand({name:'original',kind:'local',execute:async () => ({kind:'local',output:'old'})});");
  install(); const events: string[]=[]; let finish!: () => void, entered!: () => void;
  const held=new Promise<void>(resolve => {finish=resolve;}), reached=new Promise<void>(resolve => {entered=resolve;});
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async (event,payload) => {
    if (event==='session_shutdown') {events.push('shutdown'); entered();}
    if (event==='session_start' && (payload as {reason:string}).reason==='reload') events.push('start');
  }}));
  await startExtensionsFor(context);
  const close=ExtensionService.prototype.close;
  vi.spyOn(ExtensionService.prototype,'close').mockImplementationOnce(async function(this:ExtensionService) {await held; await close.call(this);});
  const first=reload(); await reached; const second=reload();
  try {await new Promise(resolve => setImmediate(resolve)); expect(events).toEqual(['shutdown']);}
  finally {finish(); await Promise.all([first,second]);}
  expect(events).toEqual(['shutdown','start']);
});

it('keeps startup messages in the original queue until the reload command settles', async () => {
  const file=path.join(root,'event.ts'); context.cliExtensionPaths=[file];
  fs.writeFileSync(file,"export default api => api.registerCommand({name:'original',kind:'local',execute:async () => ({kind:'local',output:'old'})});");
  install(); await startExtensionsFor(context);
  fs.writeFileSync(file,"export default api => api.on('session_start', async event => { if(event.reason==='reload') await api.sendMessage('Reload startup message'); });");
  const queue=new SubmissionQueue(() => context.session,() => {}), prompts: string[]=[];
  cleanups.push(attachSubmissionQueue(runtime,queue,async text => {expect(runtime.commands.current).toBeUndefined(); prompts.push(text);},() => !runtime.commands.current));
  const result=await reload(); await new Promise(resolve => setImmediate(resolve));
  expect(result.output).toContain('reloaded'); expect(prompts).toEqual(['Reload startup message']); expect(runtime.executePrompt).not.toHaveBeenCalled();
});

it('retains explicit input but removes startup entries when reload is cancelled during new startup', async () => {
  const file=path.join(root,'event.ts'); context.cliExtensionPaths=[file];
  fs.writeFileSync(file,"export default api => api.registerCommand({name:'original',kind:'local',execute:async () => ({kind:'local',output:'old'})});");
  install(); await startExtensionsFor(context);
  fs.writeFileSync(file,"export default api => api.on('session_start', async event => { if(event.reason==='reload') { await api.sendMessage('Unaccepted startup'); await api.ui.confirm('Held reload','Wait'); } });");
  const queue=new SubmissionQueue(() => context.session,() => {}), prompts: string[]=[];
  cleanups.push(attachSubmissionQueue(runtime,queue,async text => {prompts.push(text);},() => !runtime.commands.current));
  let entered!: () => void; const reached=new Promise<void>(resolve => {entered=resolve;});
  cleanups.push(bindSessionSurface(context,() => {bindExtensionUiFor(context,{confirm:async () => {entered(); await new Promise<void>(() => {}); return false;}});}));
  const controller=new AbortController(), pending=reload(controller.signal); await reached;
  queue.push('Explicit input'); controller.abort(); const result=await pending;
  expect(result.output).toContain('unknown'); expect(queue.control.entries().map(entry => entry.text)).toEqual(['Explicit input']); expect(prompts).toEqual([]);
  expect(context.workspaceIssue).toContain('not verified');
});

it('never starts a successor when original resource retirement is unknown', async () => {
  install(); await startExtensionsFor(context);
  vi.spyOn(ExtensionService.prototype,'close').mockRejectedValueOnce(new Error('Fixture cleanup'));
  const original=extensionHostFor(context); const result=await reload();
  expect(result.output).toContain('unknown'); expect(extensionHostFor(context)).toBe(original); expect(context.workspaceIssue).toContain('not verified');
});

it('routes the named reload invocation through the same bounded lifecycle owner', async () => {
  install(); const events: string[]=[];
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async (event,payload) => {
    events.push(event+':'+(payload as {reason:string}).reason);
  }}));
  await startExtensionsFor(context); events.splice(0);
  const result=await routeSlashCommand('/reload-plugins',{cwd:root,projectRoot:root,sessionId:context.session.id,extensionCommand:extensionCommandFor(context)});
  expect(result).toMatchObject({kind:'local',output:expect.stringContaining('reloaded')}); expect(events).toEqual(['session_shutdown:reload','session_start:reload']);
});

it('still retires its own old service when the outer runtime is replaced during shutdown', async () => {
  install(); let entered!: () => void, finish!: () => void;
  const reached=new Promise<void>(resolve => {entered=resolve;}), held=new Promise<void>(resolve => {finish=resolve;});
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async event => {
    if(event==='session_shutdown') {entered(); await held;}
  }}));
  await startExtensionsFor(context); const close=vi.spyOn(ExtensionService.prototype,'close');
  const pending=reload(); await reached; install(); const successor=extensionHostFor(context); finish(); const result=await pending;
  expect(result.output).toContain('unknown'); expect(close).toHaveBeenCalledOnce(); expect(extensionHostFor(context)).toBe(successor);
  expect(context.workspaceIssue).toBeUndefined();
});

it('closes an original resource generation only once when cancellation overtakes retirement', async () => {
  install(); await startExtensionsFor(context);
  let entered!: () => void, finish!: () => void;
  const reached=new Promise<void>(resolve => {entered=resolve;}), held=new Promise<void>(resolve => {finish=resolve;});
  const original=ExtensionService.prototype.close;
  const close=vi.spyOn(ExtensionService.prototype,'close').mockImplementationOnce(async function(this:ExtensionService) {entered(); await held; await original.call(this);});
  const controller=new AbortController(), pending=reload(controller.signal); await reached; controller.abort(); finish();
  const result=await pending; expect(result.output).toContain('unknown'); expect(close).toHaveBeenCalledOnce();
});

it('captures the caller source before scheduling the reload command', async () => {
  install(); await startExtensionsFor(context); const host=extensionHostFor(context), close=vi.spyOn(ExtensionService.prototype,'close');
  const pending=reload(); const successor=manager.createNew(root,{activate:false}); switchActiveSession(context,successor);
  const result=await pending; expect(result.output).toContain('refused'); expect(close).not.toHaveBeenCalled(); expect(extensionHostFor(context)).toBe(host);
  expect(context.session).toBe(successor); expect(context.workspaceIssue).toBeUndefined();
});

it('cancels the reload command from plugin cancel while old shutdown is pending', async () => {
  install(); let entered!: () => void;
  const reached=new Promise<void>(resolve => {entered=resolve;});
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async event => {
    if (event==='session_shutdown') {entered(); await new Promise<void>(() => {});}
  }}));
  await startExtensionsFor(context); const pending=reload(); await reached;
  const cancel=await extensionCommandFor(context)('plugin',['cancel'],{cwd:root,sessionId:context.session.id});
  expect(cancel.output).toContain('cancel'); expect(runtime.commands.current?.controller.signal.aborted ?? true).toBe(true);
  expect(cancel.output).toContain('not verified');
  expect((await pending).output).toContain('unknown');
  const later=await extensionCommandFor(context)('plugin',['cancel'],{cwd:root,sessionId:context.session.id});
  expect(later.output).toContain('not verified');
});

it('preserves an ordinary service cancellation drainage failure in the plugin response', async () => {
  install(); await startExtensionsFor(context);
  vi.spyOn(ExtensionService.prototype,'cancel').mockImplementationOnce(async function(this:ExtensionService) {
    this.errors.push('Extension calls did not drain; cleanup remains unknown.');
  });
  const result=await extensionCommandFor(context)('plugin',['cancel'],{cwd:root,sessionId:context.session.id});
  expect(result.output).toContain('unknown');
});

it('revokes the old shutdown invocation immediately when controlled reload is cancelled', async () => {
  install(); let entered!: () => void, finish!: () => void, callback: AbortSignal | undefined;
  const reached=new Promise<void>(resolve => {entered=resolve;}), held=new Promise<void>(resolve => {finish=resolve;});
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async (event,_payload,_aliases,signal) => {
    if(event==='session_shutdown') {callback=signal; entered(); await held;}
  }}));
  await startExtensionsFor(context); const controller=new AbortController(), pending=reload(controller.signal); await reached; controller.abort();
  try {await vi.waitFor(() => expect(callback?.aborted).toBe(true));}
  finally {finish(); await pending;}
});

it('joins the original resource retirement when close arrives during reload', async () => {
  install(); await startExtensionsFor(context); let entered!: () => void, finish!: () => void;
  const reached=new Promise<void>(resolve => {entered=resolve;}), held=new Promise<void>(resolve => {finish=resolve;});
  const original=ExtensionService.prototype.close;
  const close=vi.spyOn(ExtensionService.prototype,'close').mockImplementationOnce(async function(this:ExtensionService) {entered(); await held; await original.call(this);});
  const pending=reload(); await reached; const closing=closeExtensionsFor(context); finish(); await Promise.all([pending,closing]);
  expect(close).toHaveBeenCalledOnce();
});

it('keeps a synchronous successor host alive when old close cancellation reenters runtime installation', async () => {
  install(); let entered!: () => void, finish!: () => void;
  const reached=new Promise<void>(resolve => {entered=resolve;}), held=new Promise<void>(resolve => {finish=resolve;});
  cleanups.push(registerCatalogContribution({root,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async event => {
    if(event==='session_shutdown') {entered(); await held;}
  }}));
  await startExtensionsFor(context); const pending=reload(); await reached;
  let successor: ReturnType<typeof extensionHostFor>;
  runtime.commands.current!.controller.signal.addEventListener('abort',() => {install(); successor=extensionHostFor(context);},{once:true});
  await closeExtensionsFor(context); finish(); await pending;
  expect(extensionHostFor(context)).toBe(successor); expect(await successor!.getCommands!()).toContain('help');
});
