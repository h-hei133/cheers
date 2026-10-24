import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { SessionManager } from '../session/SessionManager.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { createDefaultExecutionService, type CommandExecutionRequest, type CommandExecutionResult } from '../runtime/execution/service.js';
import { securityStore, type SecurityStore } from '../security/findings/store.js';
import { SecurityService } from '../security/service.js';
import type { EscalationPrompt, EscalationResponse } from '../core/shell/approval/contract.js';
import { approveAllGroups } from './approval.js';

const directories: string[] = [];
export function analyzerResult(request: CommandExecutionRequest, stdout: string): CommandExecutionResult {
  return { status: 'completed', exitCode: 0, stdout, stderr: '', executionPath: 'ts-local', events: [], errorClass: 'success',
    receipt: { receiptId: 'observed-receipt', caller: 'security-analysis', operationKind: 'command.run', authorityMode: 'approved-for-write',
      requestedActionSummary: request.reportSafeCommand, executionStatus: 'success', errorClass: 'success', exitCode: 0, timedOut: false, cancelled: false,
      outputSummaryRedactionStatus: 'report-safe', evidenceCorrelationId: 'observed-evidence', notProvenClaims: [], redaction: { status: 'report-safe', redactions: [] } } };
}
export function sarifFixture(file: string, found = true, message = 'Dynamic input is executed as code.') {
  return { version: '2.1.0', runs: [{ tool: { driver: { name: 'Opengrep OSS', semanticVersion: '1.30.2', rules: [{ id: 'unsafe-dynamic-code', defaultConfiguration: { level: 'error' } }] } },
    invocations: [{ executionSuccessful: true, toolExecutionNotifications: [] }], results: found ? [{ ruleId: 'unsafe-dynamic-code', message: { text: message },
      fingerprints: { 'matchBasedId/v1': 'semantic-anchor_0' }, locations: [{ physicalLocation: { artifactLocation: { uri: file, uriBaseId: '%SRCROOT%' },
        region: { startLine: 1, startColumn: 1, endLine: 1, snippet: { text: 'eval(input)' } } } }] }] : [] }] };
}
export function createSecurityHarness(native = false) {
  const base = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'security-test-')); directories.push(directory);
  const root = path.join(directory, 'project'); const home = path.join(directory, 'home'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', directory); vi.stubEnv('CHEERS_PROVIDER_PROXY', 'off');
  const file = path.join(root, 'dynamic.ts'); fs.writeFileSync(file, 'export const decode = (input: string): unknown => eval(input);\n');
  const rules = path.join(root, 'rules.yml'); fs.writeFileSync(rules, 'rules:\n  - id: unsafe-dynamic-code\n    languages: [typescript]\n    severity: ERROR\n    message: Dynamic input is executed as code.\n    pattern: eval($VALUE)\n');
  const executable = native ? path.join(base, 'security-native/bin/opengrep') : path.join(directory, 'analyzer');
  if (!native) fs.writeFileSync(executable, 'synthetic analyzer bytes');
  const manager = new SessionManager(); const session = manager.createNew(root); const boundStore = securityStore(manager, () => session);
  let store: SecurityStore = boundStore; let busy = false;
  let approval: (prompt: EscalationPrompt) => Promise<EscalationResponse> = async prompt => approveAllGroups(prompt);
  const approvals: EscalationPrompt[] = [];
  const execution = createDefaultExecutionService();
  const run = native ? vi.fn(execution.runCommand) : vi.fn(async (request: CommandExecutionRequest) => {
    if (request.args[0] === '--version') return analyzerResult(request, '1.30.2\n');
    const files = request.args.filter(arg => arg.endsWith('.ts')); const found = fs.readFileSync(file, 'utf8').includes('eval(');
    if (request.args.includes('--sarif')) return analyzerResult(request, JSON.stringify(sarifFixture(file, found)));
    return analyzerResult(request, JSON.stringify({ version: '1.30.2', paths: { scanned: files }, errors: [], results: found ? [{ check_id: 'unsafe-dynamic-code', path: file, start: { line: 1 } }] : [] }));
  });
  const host = { sessionId: session.id, store: {
    read: () => store.read(),
    readAsync: (signal?: AbortSignal) => store.readAsync ? store.readAsync(signal) : Promise.resolve(store.read()),
    write: (update: Parameters<SecurityStore['write']>[0]) => store.write(update),
  }, root: () => root,
    homeParent: () => manager.getSessionDirPath(session.id), busy: () => busy, sourceAccess: (_absolute: string) => undefined,
    execution: { ...execution, runCommand: run }, gate: () => ({ sessionId: session.id, workspaceRoot: root, permissionScope: 'ask' as const,
      hooks: new HookDispatcher(), emit: () => undefined, escalationPromptHandler: async (prompt: EscalationPrompt) => { approvals.push(prompt); return approval(prompt); } }) };
  const service = new SecurityService(host);
  const plan = () => service.plan(executable, '1.30.2', rules, [file]).report!.facts.scanId as string;
  return { directory, root, home, file, rules, executable, manager, session, service, host, approvals, run, plan, boundStore,
    setStore: (value: SecurityStore) => { store = value; }, setBusy: (value: boolean) => { busy = value; },
    setApproval: (value: typeof approval) => { approval = value; } };
}
export function cleanupSecurityHarnesses(): void {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
}
