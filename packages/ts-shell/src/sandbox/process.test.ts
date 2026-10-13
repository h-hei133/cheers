import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { executeLocally } from '../runtime/execution/local.js';
import { withNativeReadView } from '../runtime/execution/view/index.js';
import { WalkBudget } from '../runtime/execution/walk/budget.js';
import { planSandboxedCommand } from './osSandbox.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-process-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const linux = it.skipIf(process.platform !== 'linux');

/** Inspect the actual host groups while the sandbox command is still running. */
function groups(pid: number): { pid: number; group: number; session: number }[] {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
  return [{ pid, group: Number(fields[2]), session: Number(fields[3]) },
    ...(children ? children.split(/\s+/).map(Number).flatMap(groups) : [])];
}

linux.each(['command', 'native'] as const)('keeps %s sandbox descendants in the execution owner session during cancellation', async mode => {
  const controller = new AbortController();
  let leader = 0;
  let captured: ReturnType<typeof groups> = [];
  const command = '/bin/sh';
  const args = ['-c', 'printf READY; while :; do :; done'];
  const consume = async (plan: { command: string; args: readonly string[]; readDescriptors?: readonly number[] }) => {
    const result = await executeLocally({ ...plan, args: [...plan.args], cwd: root,
      abortSignal: controller.signal, timeoutMs: 3000, cleanupTreeOnExit: true,
      onStarted: pid => { leader = pid; },
      onOutput: chunk => {
        if (chunk.includes('READY')) { captured = groups(leader); controller.abort(); }
      },
    });
    expect(result.status).toBe('cancelled');
    expect(result.terminationFailed).toBeUndefined();
    expect(captured.length).toBeGreaterThan(1);
    expect(captured.every(process => process.group === leader && process.session === leader)).toBe(true);
    expect(() => process.kill(leader, 0)).toThrow();
  };
  if (mode === 'native') {
    await withNativeReadView({ root, assertFileAccess: () => {}, budget: new WalkBudget() },
      async (_sources, plan) => consume(plan(command, args, root)));
  } else {
    const input = { shell: command, shellArgs: args, workspaceRoot: root, isolateProcesses: true,
      rules: { enabled: true, failClosed: true, network: { allowedDomains: [] }, filesystem: {} } };
    // Callers without an execution-owned session retain sandbox-created isolation.
    expect(planSandboxedCommand(input).args).toContain('--new-session');
    const plan = planSandboxedCommand({ ...input, sessionCreated: true });
    expect(plan.state).toBe('isolated');
    expect(plan.args).toContain('--unshare-pid');
    await consume({ command: plan.command!, args: plan.args! });
  }
});
