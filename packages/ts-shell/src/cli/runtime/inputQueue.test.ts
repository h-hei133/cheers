import { expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { attachSubmissionQueue, queueCommandFor } from './inputQueue.js';

function fixture() {
  const session = { id: 'session', createdAt: 'created', projectRoot: '/workspace' };
  const context = { session, projectRoot: '/workspace', cwd: '/workspace' } as ShellRuntimeContext;
  const runtime = { getCurrentRunController: () => null } as ShellSessionRuntime;
  const queue = new SubmissionQueue(() => session as never, vi.fn());
  const images = { images: [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' },
    { type: 'image' as const, data: 'AQ==', mimeType: 'image/png' }] };
  const commandContext = { cwd: '/workspace', projectRoot: '/workspace', sessionId: 'session' };
  return { context, runtime, queue, images, commandContext };
}

it.each(['add ', ''])('keeps queue %s text and images together through pending editing and one delivery', async prefix => {
  const { context, runtime, queue, images, commandContext } = fixture();
  const run = vi.fn(), detach = attachSubmissionQueue(runtime, queue, run, () => false);
  const text = '比较 /skill:a\n/skill:b  ', rawCommandArgs = prefix + text;
  try {
    const result = await queueCommandFor(context, runtime, images)(tokenizeCommandArgs(rawCommandArgs), { ...commandContext, rawCommandArgs });
    expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('Queued ') });
    expect(queue.control.entries()).toEqual([{ id: expect.any(String), lane: 'pending', text }]);
    const id = queue.control.entries()[0]!.id;
    expect(queue.control.edit(id, text + '\n检查反例')).toBe(true);
    expect(queue.shift()).toBe(text + '\n检查反例'); expect(queue.takeAttachments()).toEqual(images);
    expect(queue.takeAttachments()).toBeUndefined(); expect(queue.shift()).toBeUndefined(); expect(run).not.toHaveBeenCalled();
  } finally { detach(); }
});

it('delivers an immediately ready queued image task through the same submission port once', async () => {
  const { context, runtime, queue, images, commandContext } = fixture();
  const delivered: unknown[] = [], run = vi.fn(async (text: string) => { delivered.push({ text, attachments: queue.takeAttachments() }); });
  const detach = attachSubmissionQueue(runtime, queue, run, () => true), rawCommandArgs = 'add 比较 /skill:a /skill:b';
  try {
    await queueCommandFor(context, runtime, images)(tokenizeCommandArgs(rawCommandArgs), { ...commandContext, rawCommandArgs });
    expect(delivered).toEqual([{ text: '比较 /skill:a /skill:b', attachments: images }]);
    expect(run).toHaveBeenCalledOnce(); expect(queue.length).toBe(0); expect(queue.takeAttachments()).toBeUndefined();
  } finally { detach(); }
});

it('keeps the existing text-only queue call shape and control commands on the same pending entries', async () => {
  const { context, runtime, queue, images, commandContext } = fixture();
  const push = vi.spyOn(queue, 'push'), detach = attachSubmissionQueue(runtime, queue, vi.fn(), () => false);
  try {
    await queueCommandFor(context, runtime)(['add', 'text'], { ...commandContext, rawCommandArgs: 'add text' });
    expect(push.mock.calls).toEqual([['text']]);
    const id = queue.control.entries()[0]!.id;
    await queueCommandFor(context, runtime, images)(['list'], commandContext);
    expect(queue.control.entries()).toHaveLength(1);
    await queueCommandFor(context, runtime, images)(['cancel', id], commandContext);
    expect(queue.length).toBe(0); expect(push).toHaveBeenCalledTimes(1);
  } finally { detach(); }
});
