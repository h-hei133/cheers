import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeInProcessScript, loadInProcessExtension, loadInProcessExtensionAsync, runExtensionFactory } from './inProcessLoader.js'
import type { VersionRecord } from '../model.js'
import { runEventHandlers } from '../events/dispatch.js'
import { runExtensionInvocation } from './context.js'

const tempDirs: string[] = []
function inputWorkerDirectory(): string {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const dir = fs.mkdtempSync(path.join(scratch, 'extension-input-')); tempDirs.push(dir); return dir;
}
function nativeInput(root: string) {
  return Object.freeze({ type: 'input', text: 'Original', prompt: 'Original', sessionId: 'callback-input', workspaceRoot: root,
    timestamp: 'original', source: 'sdk' });
}
afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('in-process TS/JS extension loader with VIRTUAL_MODULES', () => {
  it('refuses session model control in an installed script before contacting the host', async () => {
    const dir = inputWorkerDirectory();
    const file = path.join(dir, 'effort.ts');
    const setThinkingLevel = vi.fn(async () => ({ status: 'applied' as const, level: 'high' as const }));
    const sendMessage = vi.fn();
    fs.writeFileSync(file, `export default api => api.on('session_start', async () => {
      try { await api.setThinkingLevel('high'); }
      catch (error) {
        if (error instanceof Error && error.message.includes('no session model control')) await api.sendMessage('refused');
      }
    });`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'effort', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'effort' }, host: { setThinkingLevel, sendMessage },
      invoke: { kind: 'event', event: 'session_start', payload: { type: 'session_start', sessionId: 'effort', workspaceRoot: dir, reason: 'startup' } },
    });
    expect(result.success).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('refused');
    expect(setThinkingLevel).not.toHaveBeenCalled();
  });

  it.each(['then-getter', 'thenable', 'constructor-getter', 'then-own', 'species', 'mixed-decision'] as const)(
    'refuses SDK collector callback %s before Promise assimilation', async kind => {
      const dir = inputWorkerDirectory(); let touched = 0; let later = 0;
      const result = { action: 'continue' }; let value: unknown;
      if (kind === 'then-getter') value = Object.defineProperty(result, 'then', { get: () => { touched++; return undefined; } });
      if (kind === 'thenable') value = { then: (resolve: (value: unknown) => void) => { touched++; resolve(result); } };
      if (kind === 'constructor-getter') value = Object.defineProperty(Promise.resolve(result), 'constructor', { get: () => { touched++; return Promise; } });
      if (kind === 'then-own') value = Object.defineProperty(Promise.resolve(result), 'then', { value: () => { touched++; return Promise.resolve(result); } });
      if (kind === 'species') {
        class CallbackPromise extends Promise<unknown> { static get [Symbol.species]() { touched++; return Promise; } }
        value = new CallbackPromise(resolve => resolve(result));
      }
      if (kind === 'mixed-decision') value = { action: 'handled', decision: 'unknown' };
      const loaded = await runExtensionFactory({ workspaceRoot: dir, factory: api => {
        api.on('input', () => value); api.on('input', () => { later++; return { action: 'continue' }; });
      } });
      const outcome = await runExtensionInvocation(undefined, undefined, () => runEventHandlers({ handlers: loaded.handlers,
        event: 'input', payload: nativeInput(dir), ownerSignal: loaded.signal })).then(result => ({ result }), error => ({ error }));
      expect(touched).toBe(0);
      expect(outcome).toMatchObject({ error: { name: 'InputRefusal', message: 'Extension input was refused.' } });
      expect(later).toBe(0);
    });

  it.each((['collector', 'worker'] as const).flatMap(mode =>
    ['then-getter', 'thenable', 'constructor-getter', 'then-own', 'prototype-constructor', 'prototype-then', 'native-species', 'species', 'mixed-decision']
      .map(kind => ({ mode, kind }))))('refuses $kind callback results in the $mode VM without executing their hooks', async ({ mode, kind }) => {
      const dir = inputWorkerDirectory(), file = path.join(dir, 'promise.ts'); const touched: unknown[] = [];
      const producer = kind === 'then-getter' ? "Object.defineProperty(result,'then',{get:()=>{touch();return undefined;}})"
        : kind === 'thenable' ? "({then:resolve=>{touch();resolve(result);}})"
        : kind === 'constructor-getter' ? "Object.defineProperty(Promise.resolve(result),'constructor',{get:()=>{touch();return Promise;}})"
        : kind === 'then-own' ? "Object.defineProperty(Promise.resolve(result),'then',{value:()=>{touch();return Promise.resolve(result);}})"
        : kind === 'species' ? "new (class extends Promise {static get [Symbol.species](){touch();return Promise;}})(resolve=>resolve(result))"
        : kind === 'mixed-decision' ? "({action:'transform',text:'Replacement',decision:'unknown'})" : 'Promise.resolve(result)';
      const mutation = kind === 'prototype-constructor' ? "Object.defineProperty(Promise.prototype,'constructor',{get:()=>{touch();return Promise;},configurable:true});"
        : kind === 'prototype-then' ? "const originalThen=Promise.prototype.then;Object.defineProperty(Promise.prototype,'then',{value:function(...args){touch();return originalThen.apply(this,args);},configurable:true});"
        : kind === 'native-species' ? "Object.defineProperty(Promise,Symbol.species,{get:()=>{touch();return Promise;},configurable:true});" : '';
      fs.writeFileSync(file, `export default api => {
        api.on('input', () => {const result={action:'continue'};const touch=()=>{${mode === 'worker' ? "void api.sendMessage('PROMISE_HOOK_EXECUTED');" : "api.events.emit('promise-hook');"}};
          ${mutation} return ${producer};});
        api.on('input', () => {${mode === 'worker' ? "void api.sendMessage('LATER_HANDLER_EXECUTED');" : "api.events.emit('later-handler');"}return {action:'continue'};});
      };`);
      if (mode === 'collector') {
        const loaded = await loadInProcessExtensionAsync({ filePath: file, workspaceRoot: dir });
        loaded.events.on('promise-hook', () => { touched.push('promise-hook'); });
        loaded.events.on('later-handler', () => { touched.push('later-handler'); });
        const outcome = await runEventHandlers({ handlers: loaded.handlers, event: 'input', payload: nativeInput(dir), ownerSignal: loaded.signal })
          .then(result => ({ result }), error => ({ error }));
        expect(touched, kind).toEqual([]);
        expect(outcome, kind).toMatchObject({ error: { name: 'InputRefusal', message: 'Extension input was refused.' } });
      } else {
        const result = await executeInProcessScript({ root: dir, scriptFile: file,
          record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
          argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' }, host: { sendMessage: message => { touched.push(message); } },
          invoke: { kind: 'event', event: 'input', payload: nativeInput(dir) } });
        expect(touched, kind).toEqual([]);
        expect(result.success, kind).toBe(false); expect(result.output, kind).toContain('Extension input was refused.');
        expect(result.output).not.toContain('PROMISE_HOOK_EXECUTED'); expect(result.output).not.toContain('LATER_HANDLER_EXECUTED');
      }
  });

  it.each(['collector', 'worker'] as const)('refuses legacy UserPromptSubmit then getters in the %s callback boundary', async mode => {
    const dir = inputWorkerDirectory(); let touched = 0;
    if (mode === 'collector') {
      const loaded = await runExtensionFactory({ workspaceRoot: dir, factory: api => {
        api.on('UserPromptSubmit', () => Object.defineProperty({ decision: 'allow' }, 'then', { get: () => { touched++; return undefined; } }));
      } });
      const result = await runEventHandlers({ handlers: loaded.handlers, event: 'UserPromptSubmit',
        payload: { eventName: 'UserPromptSubmit', sessionId: 'callback-input', workspaceRoot: dir, timestamp: 'original', prompt: 'Original' },
        ownerSignal: loaded.signal }).then(result => ({ result }), error => ({ error }));
      expect(result).toMatchObject({ error: { name: 'InputRefusal', message: 'Extension input was refused.' } });
    } else {
      const file = path.join(dir, 'legacy.ts');
      fs.writeFileSync(file, `export default api => api.on('UserPromptSubmit', () => Object.defineProperty({decision:'allow'}, 'then', {
        get:()=>{void api.sendMessage('LEGACY_THEN_EXECUTED');return undefined;}
      }));`);
      const result = await executeInProcessScript({ root: dir, scriptFile: file,
        record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
        argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' }, host: { sendMessage: () => { touched++; } },
        invoke: { kind: 'event', event: 'UserPromptSubmit',
          payload: { eventName: 'UserPromptSubmit', sessionId: 'callback-input', workspaceRoot: dir, timestamp: 'original', prompt: 'Original' } } });
      expect(result.success).toBe(false); expect(result.output).toContain('Extension input was refused.');
      expect(result.output).not.toContain('LEGACY_THEN_EXECUTED');
    }
    expect(touched).toBe(0);
  });

  it.each(['collector', 'worker'] as const)('preserves inert legacy UserPromptSubmit decisions and feedback in the %s callback boundary', async mode => {
    const dir = inputWorkerDirectory();
    const decision = { decision: 'block', feedback: 'Legacy refusal', hookSpecificOutput: { note: 'Exact decision' } };
    const payload = { eventName: 'UserPromptSubmit', sessionId: 'callback-input', workspaceRoot: dir, timestamp: 'original', prompt: 'Original' };
    if (mode === 'collector') {
      const loaded = await runExtensionFactory({ workspaceRoot: dir, factory: api => { api.on('UserPromptSubmit', () => decision); } });
      expect(await runEventHandlers({ handlers: loaded.handlers, event: 'UserPromptSubmit', payload, ownerSignal: loaded.signal })).toEqual(decision);
    } else {
      const file = path.join(dir, 'legacy.ts'); fs.writeFileSync(file, `export default api => api.on('UserPromptSubmit', () => (${JSON.stringify(decision)}));`);
      const result = await executeInProcessScript({ root: dir, scriptFile: file,
        record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
        argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' }, invoke: { kind: 'event', event: 'UserPromptSubmit', payload } });
      expect(result.success).toBe(true); expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual(decision);
    }
  });

  it.each(['block', 'retry', 'unknown', 'invalid'] as const)('keeps worker legacy UserPromptSubmit %s from being erased by a later handler', async decision => {
    const dir = inputWorkerDirectory(), file = path.join(dir, 'legacy-chain.ts');
    const payload = { eventName: 'UserPromptSubmit', sessionId: 'callback-input', workspaceRoot: dir, timestamp: 'original', prompt: 'Original' };
    const refusal = { decision, reason: 'Original refusal', feedback: 'Keep this decision' }; const touched: unknown[] = [];
    fs.writeFileSync(file, `export default api => {
      api.on('UserPromptSubmit', event => {if(!Object.isFrozen(event)||event.prompt!=='Original')throw new Error('ENVELOPE_REPLACED');return ${JSON.stringify(refusal)};});
      api.on('UserPromptSubmit', () => {void api.sendMessage('LATER_HANDLER_EXECUTED');return {decision:'allow'};});
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' }, host: { sendMessage: value => { touched.push(value); } },
      invoke: { kind: 'event', event: 'UserPromptSubmit', payload } });
    if (decision === 'invalid') { expect(result.success).toBe(false); expect(result.output).toContain('Extension input was refused.'); }
    else { expect(result.success).toBe(true); expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual(refusal); }
    expect(touched).toEqual([]);
  });

  it('keeps the original legacy worker envelope while accumulating handler feedback', async () => {
    const dir = inputWorkerDirectory(), file = path.join(dir, 'legacy-feedback.ts');
    const payload = { eventName: 'UserPromptSubmit', sessionId: 'callback-input', workspaceRoot: dir, timestamp: 'original', prompt: 'Original' };
    fs.writeFileSync(file, `export default api => {
      for(const label of ['First','Second'])api.on('UserPromptSubmit',event=>{
        if(!Object.isFrozen(event)||event.eventName!=='UserPromptSubmit'||event.prompt!=='Original')throw new Error('ENVELOPE_REPLACED');
        return {decision:'allow',feedback:label+' feedback'};
      });
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' }, invoke: { kind: 'event', event: 'UserPromptSubmit', payload } });
    expect(result.success).toBe(true);
    expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual({ decision: 'allow', feedback: 'First feedback\n\nSecond feedback' });
  });

  it.each(['transform', 'handled', 'block', 'getter', 'toJSON'] as const)('keeps worker native input results chained and inert (%s)', async mode => {
    const dir = inputWorkerDirectory();
    const file = path.join(dir, 'events.ts');
    const first = mode === 'transform' ? "({action:'transform',text:'First',source:'extension',sessionId:'replacement'})"
      : mode === 'handled' ? "({action:'handled'})" : mode === 'block' ? "({decision:'block',reason:'PRIVATE_INPUT_REASON'})"
      : mode === 'getter' ? "Object.defineProperty({action:'transform',text:'Unsafe'}, 'images', {enumerable:true,get(){throw new Error('GETTER_EXECUTED');}})"
      : "({action:'transform',text:'Unsafe',toJSON(){throw new Error('GETTER_EXECUTED');}})";
    fs.writeFileSync(file, `export default api => {
      api.on('input', () => ${first});
      api.on('input', event => {
        if (${mode === 'transform'} && (event.type !== 'input' || event.text !== 'First' || event.prompt !== 'First'
          || event.source !== 'sdk' || event.sessionId !== 'worker-input' || event.images.length !== 1)) throw new Error('ENVELOPE_REPLACED');
        if (${mode !== 'transform'}) throw new Error('LATER_HANDLER_EXECUTED');
        return {action:'transform',text:'Final',images:[]};
      });
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' },
      invoke: { kind: 'event', event: 'input', payload: { type: 'input', text: 'Original', prompt: 'Original', sessionId: 'worker-input',
        workspaceRoot: dir, timestamp: 'original', source: 'sdk', images: [{ type: 'image', mimeType: 'image/png', data: 'opaque-image-data' }] } } });
    if (mode === 'transform' || mode === 'handled') {
      expect(result.success).toBe(true);
      expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual(mode === 'handled' ? { action: 'handled' } : { action: 'transform', text: 'Final', images: [] });
    } else {
      expect(result.success).toBe(false);
      expect(result.output).toContain('Extension input was refused.');
      expect(result.output).not.toContain('GETTER_EXECUTED'); expect(result.output).not.toContain('PRIVATE_INPUT_REASON');
      expect(result.output).not.toContain('LATER_HANDLER_EXECUTED');
    }
  });

  it('keeps worker input capture replies primitive across the VM boundary', async () => {
    const dir = inputWorkerDirectory();
    const file = path.join(dir, 'events.ts');
    fs.writeFileSync(file, `export default api => api.on('input', () => {
      for (const value of [{action:'continue'}, {action:'transform',text:'Unsafe',toJSON(){return {};}}]) {
        const result = globalThis.__INPUT_RESULT(value);
        if (typeof result !== 'string') throw new Error('HOST_OBJECT');
        try { result.constructor.constructor('return process')(); throw new Error('VM_ESCAPE'); }
        catch (error) { if (error.message === 'VM_ESCAPE') throw error; }
      }
      return {action:'continue'};
    });`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'input', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'input' },
      invoke: { kind: 'event', event: 'input', payload: { type: 'input', text: 'Original', prompt: 'Original', sessionId: 'worker-input',
        workspaceRoot: dir, timestamp: 'original', source: 'sdk' } } });
    expect(result.success).toBe(true); expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual({ action: 'continue' });
  });

  it.each(['summary', 'cancel', 'getter', 'toJSON'] as const)('keeps worker before-tree results inert and cumulative (%s)', async mode => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cheers-ext-tree-'));tempDirs.push(dir);const file=path.join(dir,'events.ts');
    const first=mode==='summary'?"({summary:{summary:'Worker custom'},customInstructions:'Focus'})":mode==='cancel'?"({cancel:true})":mode==='getter'?"Object.defineProperty({}, 'summary', {enumerable:true,get(){throw new Error('GETTER_EXECUTED');}})":"({toJSON(){return {};},summary:{summary:'Invalid'}})";
    fs.writeFileSync(file,`export default api => {api.on('session_before_tree',() => ${first});api.on('session_before_tree',event => {${mode==='summary'||mode==='cancel'?"if(event.type!=='session_before_tree') throw new Error('ENVELOPE_REPLACED');":''}return {cancel:false};});};`);
    const result=await executeInProcessScript({root:dir,scriptFile:file,record:{manifest:{name:'tree',version:'1'},source:'fixture',digest:'a'.repeat(64)} as VersionRecord,argv:[],denyRules:() => [],context:{workspaceRoot:dir,taskId:'tree'},
      invoke:{kind:'event',event:'session_before_tree',payload:{type:'session_before_tree',targetEntryId:'target'}}});
    if(mode==='getter'||mode==='toJSON') {expect(result.success).toBe(false);expect(result.output).not.toContain('GETTER_EXECUTED');}
    else {expect(result.success).toBe(true);expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual(mode==='cancel'?{cancel:true}:{cancel:false,summary:{summary:'Worker custom'},customInstructions:'Focus'});}
  });
  it('keeps worker tree capture results primitive across the VM boundary', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cheers-ext-tree-'));tempDirs.push(dir);const file=path.join(dir,'events.ts');
    fs.writeFileSync(file,"export default api => api.on('session_before_tree',() => {for(const value of [{},{toJSON(){return {};}}]){const result=globalThis.__TREE_RESULT(value);if(typeof result!=='string')throw new Error('HOST_OBJECT');try{result.constructor.constructor('return process')();throw new Error('VM_ESCAPE');}catch(error){if(error.message==='VM_ESCAPE')throw error;}}return {cancel:false};});");
    const result=await executeInProcessScript({root:dir,scriptFile:file,record:{manifest:{name:'tree',version:'1'},source:'fixture',digest:'a'.repeat(64)} as VersionRecord,argv:[],denyRules:() => [],context:{workspaceRoot:dir,taskId:'tree'},
      invoke:{kind:'event',event:'session_before_tree',payload:{type:'session_before_tree',targetEntryId:'target'}}});
    expect(result.success).toBe(true); expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual({cancel:false});
  });
  it.each([true, false])('reduces worker tool results without changing protected observations (%s)', async canReplaceOutput => {
    const root = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'extension-tool-result-')); tempDirs.push(dir);
    const file = path.join(dir, 'events.ts');
    fs.writeFileSync(file, `export default api => {
      let accessor = false;
      api.on('tool_result', async () => ({ output: 'Worker replacement' }));
      api.on('tool_result', () => Object.defineProperty({}, 'output', { enumerable: true, get() { accessor = true; return 'Invalid'; } }));
      api.on('tool_result', event => {
        if (accessor || event.output !== (event.canReplaceOutput ? 'Worker replacement' : 'Original')
          || !Object.isFrozen(event.args) || event.metadata.read.page !== 1) throw new Error('UNSAFE_PROJECTION');
        const bridge = globalThis.__TOOL_RESULT({ output: 'Worker replacement' });
        if (typeof bridge !== 'string') throw new Error('HOST_OBJECT');
        return { feedback: 'Worker feedback' };
      });
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'result', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'result' },
      invoke: { kind: 'event', event: 'tool_result', payload: {
        type: 'tool_result', eventName: 'PostToolUse', workspaceRoot: dir, sessionId: 'tool-result',
        timestamp: 'original', toolName: 'read', toolCallId: 'call', args: { path: 'file' }, output: 'Original',
        success: true, isError: false, hasImages: false, canReplaceOutput, metadata: { read: { page: 1 } },
      } } });
    expect(result.success).toBe(true);
    expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual({
      ...(canReplaceOutput ? { output: 'Worker replacement' } : {}), feedback: 'Worker feedback',
    });
  });
  it.each([true, false])('reduces worker message text only for an admitted assistant message (%s)', async canReplace => {
    const root = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'extension-message-')); tempDirs.push(dir);
    const file = path.join(dir, 'events.ts');
    fs.writeFileSync(file, `export default api => {
      let invokedGetter = false;
      api.on('message_end', async () => ({ message: { role: 'assistant', content: 'First text', tool_calls: [] } }));
      api.on('message_end', () => Object.defineProperty({}, 'message', { enumerable: true,
        get() { invokedGetter = true; return { role: 'assistant', content: 'Invalid text' }; } }));
      api.on('message_end', ({ message, canReplace }) => {
        if (invokedGetter || message.tool_calls[0]?.id !== 'call' || !Object.isFrozen(message)) throw new Error('UNSAFE_PROJECTION');
        return { message: { role: 'assistant', content: message.content + ' then final' } };
      });
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'message', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'message' },
      invoke: { kind: 'event', event: 'message_end', payload: { type: 'message_end', canReplace,
        message: { role: 'assistant', content: 'Original', tool_calls: [{ id: 'call' }] },
      } } });
    expect(result.success).toBe(true);
    const receipt = result.metadata?.eventOutput;
    if (canReplace) expect(JSON.parse(String(receipt))).toEqual({ message: { role: 'assistant', content: 'First text then final' } });
    else expect(receipt).toBe('');
  });
  it.each(['summary', 'cancel', 'getter', 'thenable'] as const)('reduces worker compaction results against the original plan (%s)', async mode => {
    const root = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'extension-compact-')); tempDirs.push(dir);
    const file = path.join(dir, 'events.ts');
    const first = mode === 'summary' ? "({ summary: 'Worker checkpoint' })" : mode === 'cancel' ? '({ cancel: true })'
      : mode === 'getter' ? "Object.defineProperty({}, 'summary', { enumerable: true, get() { throw new Error('GETTER_EXECUTED'); } })"
      : "({ then(resolve) { resolve({ summary: 'THENABLE_EXECUTED' }); } })";
    fs.writeFileSync(file, `export default api => {
      api.on('session_before_compact', () => ${first});
      api.on('session_before_compact', event => {
        if (${JSON.stringify(mode)} !== 'summary' || !Object.isFrozen(event.messages[0]) || event.messages[0].text !== 'Original') throw new Error('INVALID_SECOND_HANDLER');
        return { cancel: false };
      });
    };`);
    const result = await executeInProcessScript({ root: dir, scriptFile: file,
      record: { manifest: { name: 'compact', version: '1' }, source: 'fixture', digest: 'a'.repeat(64) } as VersionRecord,
      argv: [], denyRules: () => [], context: { workspaceRoot: dir, taskId: 'compact' },
      invoke: { kind: 'event', event: 'session_before_compact', payload: { type: 'session_before_compact', messages: [{ role: 'user', text: 'Original' }] } } });
    if (mode === 'getter' || mode === 'thenable') {
      expect(result.success).toBe(false);
      expect(result.output).not.toMatch(/GETTER_EXECUTED|THENABLE_EXECUTED|INVALID_SECOND_HANDLER/);
    } else {
      expect(result.success).toBe(true);
      expect(JSON.parse(String(result.metadata?.eventOutput))).toEqual(mode === 'cancel' ? { cancel: true } : { summary: 'Worker checkpoint' });
    }
  });
  it('loads a TypeScript extension in-process, resolves @cheers/extension-api, blocks escape, and enforces path containment + denyRules', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-ts-'))
    tempDirs.push(dir)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-outside-'))
    tempDirs.push(outside)
    fs.writeFileSync(path.join(dir, 'allowed.txt'), 'hello-ext', 'utf8')
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'top-secret', 'utf8')
    fs.writeFileSync(path.join(outside, 'host-secret.txt'), 'outside', 'utf8')

    const extPath = path.join(dir, 'plugin.ts')
    fs.writeFileSync(
      extPath,
      `
const { defineExtension } = require('@cheers/extension-api');
let capturedApi: { getActiveTools: () => Promise<readonly string[]> } | undefined;
module.exports.default = defineExtension((api) => {
  capturedApi = api;
  api.registerTool({
    name: 'ext_custom_tool',
    description: 'Custom in-process tool',
    argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'ok' }),
  });
  api.on('before_provider_request', (payload) => payload);
});
module.exports.run = async ({ args, api }) => {
  return api.readWorkspaceFile(args[0]);
};
module.exports.tryEscape = () => {
  return ({}).constructor.constructor('return process')();
};
module.exports.tryModuleEscape = () => {
  return (module as unknown as { constructor: { constructor: (s: string) => () => unknown } }).constructor.constructor('return process')();
};
module.exports.tryApiEscape = () => {
  return (capturedApi as unknown as { getActiveTools: { constructor: (s: string) => () => unknown } }).getActiveTools.constructor('return process')();
};
`,
      'utf8',
    )

    const loaded = loadInProcessExtension({
      filePath: extPath,
      workspaceRoot: dir,
      denyRules: () => [{ tool: 'read', pattern: path.join(dir, 'secret.txt') }],
    })

    expect(loaded.tools).toHaveLength(1)
    expect(loaded.tools[0]?.name).toBe('ext_custom_tool')
    expect(loaded.handlers.has('before_provider_request')).toBe(true)
    expect(loaded.readWorkspaceFile('allowed.txt')).toBe('hello-ext')
    expect(() => loaded.readWorkspaceFile(path.join('..', path.basename(outside), 'host-secret.txt'))).toThrow(
      'outside',
    )
    expect(() => loaded.readWorkspaceFile('secret.txt')).toThrow()
    expect(() => (loaded.exports.tryEscape as () => unknown)()).toThrow()
    expect(() => (loaded.exports.tryModuleEscape as () => unknown)()).toThrow()
    expect(() => (loaded.exports.tryApiEscape as () => unknown)()).toThrow()
  })

  it('executes worker-isolated TS extensions with real registerTool, registerCommand, and on(event) handlers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-worker-'))
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'note.txt'), 'worker-note', 'utf8')
    const extPath = path.join(dir, 'worker-ext.ts')
    fs.writeFileSync(
      extPath,
      `
const { defineExtension } = require('@cheers/extension-api');
export default defineExtension((api) => {
  api.registerTool({
    name: 'greet',
    description: 'Greet with workspace note',
    argsSchema: { type: 'object' },
    execute: async (args) => ({ success: true, output: String(args.who ?? '') + ':' + await api.readWorkspaceFile('note.txt') }),
  });
  api.registerCommand({
    name: 'hello',
    description: 'Hello cmd',
    execute: async (args) => 'cmd:' + args.join(','),
  });
  api.on('before_provider_request', (payload) => ({ ...(payload as Record<string, unknown>), patched: true }));
});
`,
      'utf8',
    )
    const record: VersionRecord = {
      source: 'fixture',
      digest: 'deadbeef',
      url: 'https://example.invalid/worker-ext.tgz',
      trustFingerprint: 'fixture-trust',
      files: {},
      directories: [],
      storage: [],
      manifest: {
        schema: 1,
        name: 'worker-ext',
        version: '1.0.0',
        description: 'Worker ext',
        permissions: { workspace: 'read', network: 'none' },
        skills: [],
        scripts: [{ name: 'main', path: 'worker-ext.ts' }],
        commands: [],
        tools: [],
      },
      sourceIdentity: 'id',
    }
    const ctx = { workspaceRoot: dir, taskId: 't1' }

    const toolResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'tool', name: 'greet', args: { who: 'user' } },
    })
    expect(toolResult.success).toBe(true)
    expect(toolResult.output).toContain('user:worker-note')
    expect(toolResult.metadata?.registeredTools).toEqual([{ name: 'greet', description: 'Greet with workspace note' }])
    expect(toolResult.metadata?.registeredCommands).toEqual([{ name: 'hello', description: 'Hello cmd', aliases: [] }])
    expect(toolResult.metadata?.registeredEvents).toEqual(['before_provider_request'])

    const cmdResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'command', name: 'hello', args: ['a', 'b'] },
    })
    expect(cmdResult.success).toBe(true)
    expect(cmdResult.output).toContain('cmd:a,b')

    const eventResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'event', event: 'before_provider_request', payload: { model: 'm' } },
    })
    expect(eventResult.success).toBe(true)
    expect(eventResult.output).toContain('"patched":true')
  })

  it('bridges ui.*, events bus, shortcuts, flags, host queries, package metadata, and HookDispatcher event aliases', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-batch-e-'))
    tempDirs.push(dir)
    const pkgDir = path.join(dir, 'package')
    fs.mkdirSync(path.join(pkgDir, 'ext'), { recursive: true })
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'test-extension', version: '1.2.3', cheers: { extensions: ['./ext/index.ts'], skills: ['./skills'] } }),
      'utf8',
    )
    const { readPackageManifest } = await import('../registry/manifest.js')
    const discovered = readPackageManifest(pkgDir)
    expect(discovered.manifest.name).toBe('test-extension')
    expect(discovered.manifest.extensions).toEqual([path.join(pkgDir, 'ext/index.ts')])

    const extPath = path.join(dir, 'full-ext.ts')
    fs.writeFileSync(
      extPath,
      `
      import { defineExtension } from '@cheers/extension-api';
      export default defineExtension((api) => {
        api.registerShortcut({ key: 'ctrl+k', description: 'Quick pick' });
        api.registerFlag({ name: 'strict', type: 'boolean', default: true });
        const seen = [];
        api.events.on('ping', (v) => seen.push(v));
        api.events.emit('ping', 42);
        api.on('tool_call', async (payload) => {
          const confirmed = await api.ui.confirm('Run tool', payload.toolName);
          api.ui.notify('checked:' + api.getFlag('strict'));
          const tools = await api.getActiveTools();
          return confirmed ? { decision: 'allow' } : { decision: 'block', reason: 'blocked-by-ext:' + tools.join(',') };
        });
        api.registerCommand({
          name: 'status',
          description: 'Show bus',
          execute: async () => ({ success: true, output: 'seen:' + seen.join(',') + ':' + api.getFlag('strict') }),
        });
      });
      `,
      'utf8',
    )
    const notes: string[] = []
    const record: VersionRecord = {
      manifest: {
        schema: 1,
        name: 'full-ext',
        version: '1.0.0',
        permissions: { workspace: 'read', network: 'none' },
        skills: [],
        scripts: [{ name: 'main', path: 'full-ext.ts' }],
        commands: [],
        tools: [],
      },
      digest: 'b'.repeat(64),
      url: 'https://example.invalid/full-ext.tgz',
      source: 'local',
      sourceIdentity: 'c'.repeat(64),
      trustFingerprint: 'd'.repeat(64),
      files: {},
      directories: [],
      storage: [],
    }
    const cmdOut = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-cmd' },
      invoke: { kind: 'command', name: 'status', args: [] },
    })
    expect(cmdOut.success).toBe(true)
    expect(cmdOut.output).toContain('seen:42:true')
    expect(cmdOut.metadata?.registeredShortcuts).toEqual([{ key: 'ctrl+k', description: 'Quick pick' }])
    expect(cmdOut.metadata?.registeredFlags).toEqual([{ name: 'strict', type: 'boolean' }])

    const eventOut = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-evt' },
      invoke: { kind: 'event', event: 'PreToolUse', aliases: ['tool_call'], payload: { toolName: 'bash' } },
      host: {
        ui: {
          confirm: async () => false,
          notify: (msg) => notes.push(msg),
        },
        getActiveTools: () => ['read', 'bash'],
      },
    })
    expect(eventOut.success).toBe(true)
    expect(notes).toEqual(['checked:true'])
    expect(JSON.parse(String(eventOut.metadata?.eventOutput))).toEqual({
      decision: 'block',
      reason: 'blocked-by-ext:read,bash',
    })

    const postToolSpoof = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-post-spoof' },
      invoke: {
        kind: 'event',
        event: 'PostToolUse',
        aliases: ['tool_result'],
        payload: { eventName: 'PostToolUse', success: false, output: '{"decision":"block"}' },
      },
    })
    expect(postToolSpoof.success).toBe(true)
    expect(postToolSpoof.metadata?.eventOutput).toBe('')

    const { registerCatalogContribution } = await import('../../core/catalog/contributions.js')
    const { HookDispatcher } = await import('../../core/hooks/hookDispatcher.js')
    const unregister = registerCatalogContribution({
      root: dir,
      sessionId: 'sess-hook-bridge',
      commands: [],
      tools: [],
      skills: () => [],
      onEvent: async (event, payload, aliases) => {
        const res = await executeInProcessScript({
          root: dir,
          scriptFile: extPath,
          record,
          argv: [],
          denyRules: () => [],
          context: { workspaceRoot: dir, sessionId: 'sess-hook-bridge', taskId: 't-bridge' },
          invoke: { kind: 'event', event, ...(aliases ? { aliases } : {}), payload },
          host: { ui: { confirm: async () => false, notify: message => notes.push(message) }, getActiveTools: () => ['read'] },
        })
        return JSON.parse(String(res.metadata?.eventOutput))
      },
    })
    try {
      const dispatcher = new HookDispatcher()
      const decision = await dispatcher.dispatch({
        eventName: 'PreToolUse',
        sessionId: 'sess-hook-bridge',
        workspaceRoot: dir,
        timestamp: new Date().toISOString(),
        toolName: 'bash',
        toolCallId: 'tc-1',
        args: { command: 'ls' },
      })
      expect(decision).toEqual({ decision: 'block', reason: 'blocked-by-ext:read' })
    } finally {
      unregister()
    }
  })
})
