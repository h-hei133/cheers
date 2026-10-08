import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../../session/SessionManager.js';
import { readGoalEdit } from '../store.js';
import { runGuidanceCommand } from './command.js';
import { readGuidance } from './store.js';

let scratch: string; let root: string;
beforeEach(() => {
  scratch = fs.mkdtempSync(path.resolve(process.cwd(), '../../.tmp/guidance-test-')); root = path.join(scratch, 'project');
  const home = path.join(scratch, 'home'); fs.mkdirSync(path.join(root, '.git'), { recursive: true }); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(scratch, { recursive: true, force: true }); });

it.each(['signal', 'slash'] as const)('leaves a %s-cancelled actual guided question unanswered and creates no goal', async cancellation => {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const input = new PassThrough(); const output = new PassThrough();
  const rl = readline.createInterface({ input, output, terminal: false });
  let asked!: () => void; const question = new Promise<void>(resolve => { asked = resolve; });
  output.on('data', chunk => { if (String(chunk).includes('observable outcome')) asked(); });
  const context = { cwd: root, projectRoot: root, sessionId: session.id, interactive: true };
  try {
    const active = runGuidanceCommand(['Build', 'a', 'parser'], context, manager, session, rl);
    await question;
    if (cancellation === 'signal') rl.emit('SIGINT');
    else await runGuidanceCommand(['cancel'], context, manager, session, rl);
    await active;
    expect(readGuidance(manager, session).draft?.answers).toEqual({ objective: 'Build a parser' });
    expect(readGoalEdit(manager, session).goal).toBeUndefined();
    if (cancellation === 'slash') expect(readGuidance(manager, session).draft?.phase).toBe('cancelled');
  } finally { rl.close(); input.end(); output.end(); }
});
