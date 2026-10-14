import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { runPreparedTool } from '../../turn/invoke.js';
import { createTaskToolDefinition } from '../tools/taskTool.js';
import { HookDispatcher } from '../hooks/hookDispatcher.js';
import { projectTrust } from '../security/projectTrust.js';
import { AgentMemoryManager } from './agentMemoryManager.js';
import { SubagentLoader } from './subagentLoader.js';

afterEach(cleanupAdvisorHarnesses);
function fixture() {
  const f = createAdvisorHarness(false, false);
  const definitions = new SubagentLoader(f.root).userAgentsDir; fs.mkdirSync(definitions, { recursive: true });
  // A user role remains available without admitting project definitions. This
  // isolates the memory consumer from the definition loader's source checks.
  vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(true);
  fs.writeFileSync(path.join(definitions, 'review.md'), '---\nname: review\ndescription: Review\ntools: []\nmemory: project\n---\nReview safely.');
  const memory = path.join(f.root, '.agents', 'memory', 'review', 'MEMORY.md');
  fs.mkdirSync(path.dirname(memory), { recursive: true }); fs.writeFileSync(memory, 'PERSISTENT_NOTES');
  const runner = vi.fn(async (_request: unknown) => ({ text: 'answer', failed: false, steps: 1, allowedTools: [] }));
  const options = { workspaceRoot: f.root, sessionId: f.session.id, agentMode: 'build' as const,
    permissionScope: 'allow-all' as const, hooks: new HookDispatcher(), runSubagent: runner, emit: () => {} };
  const args = { description: 'review', prompt: 'review', subagent_type: 'review' };
  return { ...f, memory, runner, options, run: (extra = {}) => runPreparedTool(createTaskToolDefinition(), args, { ...options, ...extra }) };
}

it('intersects persistent memory with the parent read policy before opening or dispatching', async () => {
  const f = fixture(); const open = vi.spyOn(fs.promises, 'open');
  const denied = await f.run({ denyRules: [{ tool: 'read', pattern: f.memory }] });
  expect(denied.isError).toBe(true); expect(f.runner).not.toHaveBeenCalled();
  expect(open.mock.calls.some(call => call[0] === f.memory)).toBe(false);
  const allowed = await f.run();
  expect(allowed.isError, allowed.output).toBe(false);
  expect(f.runner.mock.calls[0]?.[0]).toMatchObject({ memory: expect.stringContaining('PERSISTENT_NOTES') });
});

it('rejects memory links outside the authorized source before dispatch', async () => {
  const f = fixture(); const outside = path.join(f.directory, 'outside.md'); fs.writeFileSync(outside, 'OUTSIDE_NOTES');
  fs.unlinkSync(f.memory); fs.symlinkSync(outside, f.memory);
  const result = await f.run();
  expect(result.isError).toBe(true); expect(f.runner).not.toHaveBeenCalled();
  expect(result.output).not.toContain('OUTSIDE_NOTES');
});

it('bounds actual memory reads and closes the handle when the source exceeds its budget', async () => {
  const f = fixture(); fs.writeFileSync(f.memory, Buffer.alloc(128 * 1024, 'x'));
  const open = fs.promises.open.bind(fs.promises); let bytes = 0; let closed = false;
  vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    if (args[0] === f.memory) {
      const read = handle.read.bind(handle); const close = handle.close.bind(handle);
      vi.spyOn(handle, 'read').mockImplementation(async (...values: Parameters<typeof handle.read>) => {
        const result = await read(...values); bytes += result.bytesRead; return result;
      });
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed = true; });
    }
    return handle;
  });
  const result = await f.run();
  expect(result.isError).toBe(true); expect(f.runner).not.toHaveBeenCalled();
  expect(bytes, result.output).toBe(64 * 1024 + 1); expect(closed).toBe(true);
});

it('keeps missing memory optional and propagates cancellation and user-memory policy refusal', async () => {
  const f = fixture(); fs.unlinkSync(f.memory);
  const manager = new AgentMemoryManager(f.root);
  expect((await manager.loadMemory('review')).content).toBe('');
  const controller = new AbortController(); controller.abort();
  await expect(manager.loadMemory('review', 'project', controller.signal)).rejects.toThrow();
  const refused = new AgentMemoryManager(f.root, () => { throw new Error('Parent source refused.'); });
  await expect(refused.loadMemory('review', 'user')).rejects.toThrow('Parent source refused.');
});

it('preserves explicitly admitted legacy user memory when the current memory root also exists', async () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.directory, 'home', '.cheers', 'agent-memory', 'another'), { recursive: true });
  const legacy = path.join(f.directory, 'home', '.cheer', 'agent-memory', 'review', 'MEMORY.md');
  fs.mkdirSync(path.dirname(legacy), { recursive: true }); fs.writeFileSync(legacy, 'LEGACY_NOTES');
  const sourceAccess = vi.fn();
  const memory = await new AgentMemoryManager(f.root, sourceAccess).loadMemory('review', 'user');
  expect(memory.content).toBe('LEGACY_NOTES'); expect(sourceAccess).toHaveBeenCalledWith(legacy);
});
