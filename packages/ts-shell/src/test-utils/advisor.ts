import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { SessionManager } from '../session/SessionManager.js';
import { AdvisorRuntime, type AdvisorHost } from '../advisor/runtime.js';
import type { AdvisorBoundary, AdvisorConfig } from '../advisor/model.js';
import type { SubagentRunResult } from '../core/subagents/runner.js';

const directories: string[] = [];
export function createAdvisorHarness(config: AdvisorConfig | false = { target: 'openai/review-model', every: 1, timeoutMs: 500, mode: 'turn' }, enabled = true) {
  const temporary = path.resolve(process.cwd(), '../../.tmp'); fs.mkdirSync(temporary, { recursive: true });
  const directory = fs.mkdtempSync(path.join(temporary, 'advisor-test-')); directories.push(directory);
  const root = path.join(directory, 'project'); const home = path.join(directory, 'home');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', directory); vi.stubEnv('CHEERS_PROVIDER_PROXY', 'off');
  const manager = new SessionManager(); const session = manager.createNew(root); let current = session;
  const reports: string[] = []; const host: AdvisorHost = { store: manager, current: () => current, report: value => reports.push(value) };
  const runtime = new AdvisorRuntime(host);
  if (config) runtime.configure(config); if (enabled) runtime.setEnabled(true);
  manager.persistUserPromptBarrier(session.id, 'Review actual work');
  const sourcePromptEntryId = manager.getSession(session.id)!.turns.at(-1)!.id!;
  const boundary = (text: string, step = 1, willContinue = true): AdvisorBoundary => ({ sourcePromptEntryId, step, willContinue, failed: false,
    messages: [{ role: 'user', content: 'Review actual work' }, { role: 'tool', content: text }] });
  return { directory, root, manager, session, runtime, reports, host, sourcePromptEntryId, boundary,
    signal: new AbortController().signal, setCurrent: (value: typeof session) => { current = value; } };
}
export function advisorResult(text = 'Check the captured evidence before editing'): SubagentRunResult {
  return { text, failed: false, steps: 1, allowedTools: [] };
}
export function cleanupAdvisorHarnesses(): void {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
}
