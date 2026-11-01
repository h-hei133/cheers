import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapShellRuntime } from '../../core/shell/bootstrap.js';
import { createCliSessionRuntime } from '../runtime/cliSessionRuntimeFactory.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { getWorkflowGitContext } from '../../workflow/gitContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import { createCliEscalationPromptHandler } from '../../entrypoints/cliApprovalModule.js';
import { buildToolEscalationPrompt } from '../../core/query/toolPolicy.js';
import { switchRuntimeSessionProjectContext } from '../../entrypoints/cliSessionModule.js';
import { routeInteractiveCommand } from './interactiveCommandRouter.js';

let scratch: string, primary: string, other: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/permission-project-');
  primary = path.join(scratch, 'Project'); other = path.join(scratch, process.platform === 'linux' ? 'project' : 'other');
  for (const folder of [primary, other, path.join(scratch, 'home')]) fs.mkdirSync(folder);
  vi.stubEnv('HOME', path.join(scratch, 'home')); vi.stubEnv('USERPROFILE', path.join(scratch, 'home'));
  vi.stubEnv('CHEERS_TEST_ROOT', path.join(scratch, 'data'));
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic'); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

function setup() {
  const manager = new SessionManager(), renderer = new StreamingRenderer(), lines: string[] = [];
  vi.spyOn(renderer, 'renderLine').mockImplementation(line => { lines.push(line); });
  const context = bootstrapShellRuntime({ cwd: primary, runtimeConfig: getRuntimeConfig(primary),
    gitContext: getWorkflowGitContext(primary), sessionManager: manager, renderer, emitLifecycleMessages: false }).context;
  const policy = new ApprovalTrustPolicy();
  const runtime = createCliSessionRuntime({ runtimeContext: context, sessionManager: manager, renderer, options: {},
    approvalTrustPolicy: policy, getReadline: () => null, providerRuntimeBridge: {
      resolveCredentialSnapshot: () => ({ provider: 'openai', expectedEnvVarName: 'OPENAI_API_KEY' }),
      providerModeEnv: () => 'synthetic', realProviderSmokeOptIn: () => false,
    } });
  const answer = vi.fn(async () => 'deny' as const);
  const approve = createCliEscalationPromptHandler(renderer, null, () => 'compact', policy, () => context.projectRoot,
    undefined, undefined, undefined, () => runtime.getPermissionScope(), answer);
  const route = (prompt: string) => routeInteractiveCommand({ prompt, readline: {} as never, mcpGateway: {} as never,
    sessionManager: manager, runtimeContext: context, renderer, sessionRuntime: runtime,
    logger: { error() {}, info() {} } as never, approvalTrustPolicy: policy, turnNumber: 0 });
  return { manager, context, runtime, lines, route, answer, approve };
}

describe('permission scope project ownership', () => {
  it.each(['resume', 'workspace attach', 'workspace rebind'].flatMap(action =>
    (['allow-all', 'accept-edits'] as const).map(scope => ({ action, scope }))))('retires $scope through the actual $action route', async ({ action, scope }) => {
    const view = setup(), original = view.context.session.id, revision = view.context.projectRevision;
    const target = action === 'resume' ? view.manager.createNew(other).id : other;
    view.runtime.setPermissionScope(scope); expect(view.runtime.getPermissionScope()).toBe(scope);
    await view.route(`/${action} ${target}`);
    expect(view.context.projectRoot, view.lines.join('\n')).toBe(other);
    expect(view.context.session.id === original).toBe(action === 'workspace rebind');
    // Exercise the first consumer directly: a display read must not be needed
    // to retire a grant before the actual approval owner sees it.
    const result = await view.approve(buildToolEscalationPrompt('write', 'write', 'public fixture', 'Review fixture'));
    expect(result.decision).toBe('deny'); expect(view.answer).toHaveBeenCalledOnce();
    expect(view.runtime.getPermissionScope()).toBe('ask');
    expect(view.context.projectRevision).toBe((revision ?? 0) + 1);
  });

  it('keeps case-distinct POSIX roots separate in the session switch owner', () => {
    const view = setup(), target = view.manager.createNew(other);
    expect(switchRuntimeSessionProjectContext(view.context, target)).toBe(true);
    expect(view.context.projectRoot).toBe(other);
  });

  it.each(['allow-all', 'accept-edits'] as const)('preserves %s across same-project sessions and a new turn', async scope => {
    const view = setup(), target = view.manager.createNew(primary), revision = view.context.projectRevision;
    view.runtime.setPermissionScope(scope);
    await view.route(`/resume ${target.id}`);
    expect(view.context.session.id, view.lines.join('\n')).toBe(target.id);
    expect(view.runtime.getPermissionScope()).toBe(scope);
    await view.runtime.executePrompt(target.id, 'Public synthetic fixture');
    expect(view.runtime.getPermissionScope()).toBe(scope); expect(view.context.projectRevision).toBe(revision);
  });

  it('does not resurrect a retired grant when returning to the original project', async () => {
    const view = setup(), original = view.context.session.id, target = view.manager.createNew(other), revision = view.context.projectRevision;
    view.runtime.setPermissionScope('allow-all'); await view.route(`/resume ${target.id}`);
    expect(view.context.projectRoot).toBe(other);
    await view.route(`/resume ${original}`); expect(view.context.projectRoot).toBe(primary);
    expect(view.runtime.getPermissionScope()).toBe('ask');
    expect(view.context.projectRevision).toBe((revision ?? 0) + 2);
    view.runtime.setPermissionScope('accept-edits'); expect(view.runtime.getPermissionScope()).toBe('accept-edits');
  });

  it('preserves scope for an attached root and refuses an unsuccessful project migration without changing it', async () => {
    const view = setup(), revision = view.context.projectRevision; view.runtime.setPermissionScope('accept-edits');
    await view.route(`/workspace add ${other}`);
    expect(view.context.session.workspaceRoots).toMatchObject([{ path: other, access: 'read' }]);
    expect(view.context.projectRoot).toBe(primary); expect(view.runtime.getPermissionScope()).toBe('accept-edits');
    await view.route(`/workspace rebind ${path.join(scratch, 'missing')}`);
    expect(view.context.projectRoot).toBe(primary); expect(view.runtime.getPermissionScope()).toBe('accept-edits');
    expect(view.context.projectRevision).toBe(revision);
  });

  it('keeps neutral scope across project changes and refuses elevation without a valid primary root', async () => {
    const view = setup(), target = view.manager.createNew(other);
    expect(view.runtime.getPermissionScope()).toBe('ask'); await view.route(`/resume ${target.id}`);
    expect(view.runtime.getPermissionScope()).toBe('ask');
    view.context.projectRoot = ''; view.runtime.setPermissionScope('allow-all');
    expect(view.runtime.getPermissionScope()).toBe('ask');
  });
});
