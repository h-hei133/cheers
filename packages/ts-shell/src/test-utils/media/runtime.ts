import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { installJobsRuntime, jobsFor } from '../../cli/runtime/jobs.js';
import type { JobsComposition } from '../../cli/jobs/model.js';

export function mediaFixture() {
  const scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/media-test-')); const root = path.join(scratch, 'project');
  const home = path.join(scratch, 'home'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  const manager = new SessionManager(); const context = { session: manager.createNew(root), cwd: root, projectRoot: root } as ShellRuntimeContext;
  context.configuration = new ConfigState(getRuntimeConfig(root), configurationBinding(context));
  Object.defineProperty(context, 'runtimeConfig', { get: () => context.configuration.current.config });
  const runtime = { getCurrentRunController: () => null, getAgentMode: () => 'build', getPermissionScope: () => 'ask' } as unknown as ShellSessionRuntime;
  const approvals: string[] = []; const notices: string[] = [];
  let approve: (name: string) => Promise<'allow-once' | 'deny'> = async () => 'allow-once';
  let target = 'http://127.0.0.1:1/v1';
  const input = { notice: (text: string) => notices.push(text), providerRuntimeBridge: {
    resolveCredentialSnapshot: () => ({ provider: 'openai-compatible', expectedEnvVarName: 'SYNTHETIC', baseUrl: target,
      credential: { provider: 'openai-compatible', authMode: 'api-key', apiKey: 'synthetic-fixture', source: 'config', envVarName: 'SYNTHETIC' } }) } } as JobsComposition['agentRuntimeInput'];
  installJobsRuntime(context, manager, runtime, () => ({ sessionId: context.session.id, workspaceRoot: root,
    agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: event => manager.appendQueryEvent(context.session.id, event),
    escalationPromptHandler: async prompt => { const name = prompt.context.toolName; approvals.push(name);
      return { decision: await approve(name), promptId: prompt.id, respondedAt: Date.now() }; }, admission: () => undefined }), input);
  return { scratch, root, manager, context, runtime, approvals, notices, host: jobsFor(context)!,
    decision: (value: typeof approve) => { approve = value; }, endpoint: (value: string) => { target = value; } };
}
export async function until(predicate: () => boolean): Promise<void> {
  const end = Date.now() + 4000;
  while (!predicate()) { if (Date.now() >= end) throw new Error('Fixture observation timed out.'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
