import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArtifactManager } from '../../session/artifactManager.js';
import { createToolResultMessage } from '../../agent/tools.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { CommandExecutionResult } from '../../../runtime/execution/types.js';
import { createCoreToolRegistry } from '../registry.js';

let root: string;
beforeEach(async () => {
  const temporary = path.join(os.tmpdir(), 'cheers-test');
  await fs.mkdir(temporary, { recursive: true });
  root = await fs.mkdtemp(path.join(temporary, 'command-output-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function quote(value: string): string {
  return process.platform === 'win32' ? `"${value.replaceAll('"', '""')}"` : `'${value.replaceAll("'", "'\\''")}'`;
}

it('preserves command failure classification and its receipt with bounded capture', async () => {
  const script = path.join(root, 'denied.cjs');
  await fs.writeFile(script, "process.stderr.write('permission denied', () => { process.exitCode = 1; });");
  const service = createDefaultExecutionService();
  const run = service.runCommand.bind(service);
  let observed: CommandExecutionResult | undefined;
  vi.spyOn(service, 'runCommand').mockImplementation(async request => observed = await run(request));
  const result = await createCoreToolRegistry({ executionService: service }).get('bash')!.execute(
    { command: `${quote(process.execPath)} ${quote(script)}`, timeout: 10 },
    { workspaceRoot: root, sessionId: 'classification', taskId: 'classification' });
  expect(result.success).toBe(false);
  expect(result.error).toContain('permission denied');
  expect(result.metadata).toMatchObject({ status: 'failed', errorClass: 'permission_denied' });
  expect(observed?.receipt).toMatchObject({ executionStatus: 'failure', errorClass: 'permission_denied' });
});

it('keeps a completed command observable when its full output cannot be saved', async () => {
  const script = path.join(root, 'unsaved.cjs');
  await fs.writeFile(script, "process.stdout.write('line\\n'.repeat(40000), () => { process.exitCode = 0; });");
  vi.spyOn(ArtifactManager.prototype, 'createTextStaging').mockRejectedValue({ cleanup: 'complete' });
  const result = await createCoreToolRegistry().get('bash')!.execute(
    { command: `${quote(process.execPath)} ${quote(script)}`, timeout: 10 },
    { workspaceRoot: root, sessionId: 'unsaved', taskId: 'unsaved' });
  expect(result.success).toBe(true);
  expect(result.metadata).toMatchObject({ status: 'completed', exitCode: 0, outputComplete: false });
  expect(result.output).toContain('complete output is unavailable');
  expect(result.output).not.toContain('artifact://');
  const message = createToolResultMessage('bash', result.output!, result.metadata);
  expect(Buffer.byteLength(message.content as string)).toBeLessThanOrEqual(50 * 1024);
});

it('cancels the same native command and labels the output incomplete', async () => {
  const script = path.join(root, 'cancel.cjs');
  await fs.writeFile(script, "process.stdout.write('ready\\n'); setInterval(() => process.stdout.write('tick\\n'), 100);");
  const controller = new AbortController();
  const service = createDefaultExecutionService();
  const dispatch = vi.spyOn(service, 'runCommand');
  const result = await createCoreToolRegistry({ executionService: service }).get('bash')!.execute(
    { command: `${quote(process.execPath)} ${quote(script)}`, timeout: 10 },
    { workspaceRoot: root, sessionId: 'cancel', taskId: 'cancel', abortSignal: controller.signal,
      onOutput: text => { if (text.includes('ready')) controller.abort(); } });
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(result.success).toBe(false);
  expect(result.metadata).toMatchObject({ status: 'cancelled', errorClass: 'cancelled', outputComplete: false });
  expect(result.error).toContain('Output capture incomplete');
  expect(result.error).not.toContain('Full text output saved');
});
it.each([0, 7])('bounds native capture and preserves the full selected streams for exit %s', async exitCode => {
  const stdout = `first stdout\n${`${'界'.repeat(120)}\n`.repeat(1_280)}last stdout\n`;
  const stderr = `first stderr\n${`${'é'.repeat(120)}\n`.repeat(1_280)}last stderr\n`;
  const script = path.join(root, 'produce.cjs');
  await fs.writeFile(script, `process.stdout.write(${JSON.stringify(stdout)}, () => process.stderr.write(${JSON.stringify(stderr)}, () => { process.exitCode = ${exitCode}; }));`);
  const service = createDefaultExecutionService();
  const run = service.runCommand.bind(service);
  const observed: CommandExecutionResult[] = [];
  const dispatch = vi.spyOn(service, 'runCommand').mockImplementation(async request => {
    const result = await run(request);
    observed.push(result);
    return result;
  });
  const bash = createCoreToolRegistry({ executionService: service }).get('bash')!;
  const result = await bash.execute({ command: `${quote(process.execPath)} ${quote(script)}`, timeout: 10 },
    { workspaceRoot: root, sessionId: 'output', taskId: 'output' });

  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(dispatch.mock.calls[0]![0].captureOutput).toBe(false);
  expect(observed).toHaveLength(1);
  expect(Buffer.byteLength(observed[0]!.stdout)).toBeLessThanOrEqual(100 * 1_024);
  expect(Buffer.byteLength(observed[0]!.stderr)).toBeLessThanOrEqual(100 * 1_024);
  expect({ status: observed[0]!.status, exitCode: observed[0]!.exitCode, outputFailed: observed[0]!.outputFailed,
    terminationFailed: observed[0]!.terminationFailed, outputNotice: result.metadata?.outputNotice,
    stdoutBytes: Buffer.byteLength(observed[0]!.stdout), stderrBytes: Buffer.byteLength(observed[0]!.stderr) })
    .toMatchObject({ status: exitCode === 0 ? 'completed' : 'failed', exitCode, outputFailed: undefined, terminationFailed: undefined });
  expect(result.success).toBe(exitCode === 0);
  expect(result.metadata).toMatchObject({ status: exitCode === 0 ? 'completed' : 'failed', exitCode });
  const notice = String(result.metadata?.outputNotice ?? '');
  const uri = /artifact:\/\/\d+/.exec(notice)?.[0];
  expect(uri).toBeDefined();
  expect(result.metadata).toMatchObject({ truncated: true, outputArtifact: uri });
  const artifact = ArtifactManager.getShared(root, 'output').resolve(uri!);
  expect(artifact).not.toBeNull();
  expect(await fs.readFile(artifact!, 'utf8')).toBe(exitCode === 0 ? stdout : `${stderr}\n${stdout}`);
  const message = createToolResultMessage('bash', result.success ? result.output! : result.error!, result.metadata);
  expect(message.content).toContain(uri);
  expect(Buffer.byteLength(message.content as string)).toBeLessThanOrEqual(50 * 1_024);
  expect((await fs.readdir(path.dirname(artifact!))).filter(name => /(?:\.tmp-|staging)/.test(name))).toEqual([]);
});
