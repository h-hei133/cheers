// A recovery-fabricated compensated event must not read as a real failure that
// permanently blocks goal acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = f => import(pathToFileURL(path.join(built, f)));
const { acceptanceEvidence } = await load('planning/goal/acceptance/evaluate.js');
const approvedAt = '2026-10-31T00:00:00.000Z';
const acceptance = { approvedAt, criteria: [], checks: {} };
const scope = { sessionId: 'sess_x' };
const event = (inner, at) => ({ type: 'query-event', id: `e-${at}`, timestamp: at, event: inner });
const receipt = { status: 'not-run' };
try {
  const realFailure = [event({ type: 'tool.result', toolName: 'write', taskId: 'c1', success: false }, '2026-10-31T00:01:00.000Z')];
  const compensatedFailure = [event({ type: 'tool.result', toolName: 'write', taskId: 'c1', success: false, compensated: true }, '2026-10-31T00:01:00.000Z')];
  const compensatedDenial = [event({ type: 'approval.resolved', toolName: 'write', taskId: 'c1', outcome: 'denied', compensated: true }, '2026-10-31T00:01:00.000Z')];
  receipt.realFailureBlocks = acceptanceEvidence(acceptance, scope, realFailure, [], () => {}) === undefined;
  receipt.compensatedFailureBlocks = acceptanceEvidence(acceptance, scope, compensatedFailure, [], () => {}) === undefined;
  receipt.compensatedDenialBlocks = acceptanceEvidence(acceptance, scope, compensatedDenial, [], () => {}) === undefined;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally { console.log(JSON.stringify(receipt)); }
if (receipt.status !== 'passed') process.exitCode = 1;
