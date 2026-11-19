import {expect, it, vi} from 'vitest';
import {HookDispatcher} from '../hookDispatcher.js';
import {inputAdmissionReceipt, consumeInputAdmission} from './receipt.js';

it('binds a receipt to the exact submission and consumes it only once', () => {
  const hooks = new HookDispatcher(), signal = new AbortController().signal;
  const check = vi.fn();
  const source = {sessionId:'input-session', workspaceRoot:'/tmp/cheers-test/input-receipt', text:'Effective', signal, check, hooks};
  const receipt = inputAdmissionReceipt(source);
  expect(() => consumeInputAdmission(receipt, {...source, text:'Changed'})).toThrow();
  expect(consumeInputAdmission(receipt, source)).toBe(hooks);
  expect(() => consumeInputAdmission(receipt, source)).toThrow();
  expect(() => consumeInputAdmission({kind:'input-admission'}, source)).toThrow();
});

it('rejects changed hook registration before a receipt can bypass submission', () => {
  const hooks = new HookDispatcher(), signal = new AbortController().signal;
  const source = {sessionId:'input-session', workspaceRoot:'/tmp/cheers-test/input-receipt', text:'Effective', signal, check:() => {}, hooks};
  const receipt = inputAdmissionReceipt(source);
  hooks.registerInProcessHook({event:'UserPromptSubmit', handler:() => ({decision:'block'})});
  expect(() => consumeInputAdmission(receipt, source)).toThrow(/input|hook|registration|changed/i);
});
