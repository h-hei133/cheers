import fs from 'node:fs';
import path from 'node:path';
import { assertProfileIdentity, type ProfileContext } from '../../../core/paths/profile/context.js';
import { assertDirectoryIdentity, assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { readTextFile } from '../../../core/workspace/files.js';
import { withFileLock, writeTextFileAtomic } from '../../../session/store/sessionFileStore.js';
import { createSessionId, validateSessionId } from '../../../session/store/sessionFileLayout.js';
import { MAX_SWITCH_DEPTH, switchDigest, type SwitchPlan, type SwitchReceipt } from './model.js';

function location(source: ProfileContext, operation: string): string {
  assertProfileIdentity(source); assertUnlinkedPath(source.root);
  if (!/^[a-f0-9]{64}$/.test(operation)) throw new Error('A full profile switch operation digest is required.');
  const target = path.join(source.root, '.handoffs', `${operation}.json`); assertUnlinkedPath(target);
  return target;
}
export function checkSwitch(receipt: SwitchReceipt): void {
  assertProfileIdentity(receipt.plan.source); assertProfileIdentity(receipt.plan.target);
  assertUnlinkedPath(receipt.plan.source.root); assertUnlinkedPath(receipt.plan.target.root);
  assertDirectoryIdentity(receipt.plan.workspace); assertDirectoryIdentity(receipt.plan.workingDirectory);
  if (receipt.version !== 1 || receipt.plan.version !== 1 || switchDigest(receipt.plan) !== receipt.operation
    || typeof receipt.plan.generation !== 'string' || !receipt.plan.generation || !Number.isSafeInteger(receipt.plan.depth) || receipt.plan.depth < 1 || receipt.plan.depth > MAX_SWITCH_DEPTH
    || validateSessionId(receipt.targetSessionId) !== receipt.targetSessionId || !receipt.targetSessionId.startsWith('sess_')
    || !Number.isSafeInteger(receipt.parentPid) || receipt.parentPid <= 0) throw new Error('Profile switch binding is invalid.');
}
export function readSwitch(source: ProfileContext, operation: string): SwitchReceipt | undefined {
  const text = readTextFile(location(source, operation), 128 * 1024);
  if (text === undefined) return undefined;
  const receipt = JSON.parse(text) as SwitchReceipt;
  if (receipt.operation !== operation || receipt.plan?.source?.root !== source.root || receipt.plan.source.rootIdentity !== source.rootIdentity
    || !['prepared', 'drained', 'dispatched', 'admitting', 'admitted', 'unknown'].includes(receipt.status)) throw new Error('Profile switch receipt is invalid.');
  checkSwitch(receipt);
  return receipt;
}
function writeSwitch(receipt: SwitchReceipt): void {
  checkSwitch(receipt);
  const target = location(receipt.plan.source, receipt.operation); const text = JSON.stringify(receipt, null, 2) + '\n';
  writeTextFileAtomic(target, text, 0o600);
  checkSwitch(receipt);
  if (readTextFile(target, 128 * 1024) !== text) throw new Error('Profile switch receipt publication is unverified.');
}
export function changeSwitch(source: ProfileContext, operation: string, update: (current: SwitchReceipt) => SwitchReceipt): SwitchReceipt {
  const target = location(source, operation); assertUnlinkedPath(`${target}.lock`);
  return withFileLock(`${target}.lock`, () => {
    const current = readSwitch(source, operation);
    if (!current) throw new Error('Profile switch receipt is missing.');
    const next = update(current); writeSwitch(next); return next;
  }, { createParent: false });
}
export function prepareSwitch(plan: SwitchPlan): SwitchReceipt {
  const operation = switchDigest(plan); const target = location(plan.source, operation);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  assertUnlinkedPath(`${target}.lock`);
  return withFileLock(`${target}.lock`, () => {
    if (readSwitch(plan.source, operation)) throw new Error('A retained switch already exists; inspect it without replaying dispatch.');
    const receipt: SwitchReceipt = { version: 1, operation, plan, targetSessionId: createSessionId(), parentPid: process.pid, status: 'prepared' };
    writeSwitch(receipt); return receipt;
  }, { createParent: false });
}
