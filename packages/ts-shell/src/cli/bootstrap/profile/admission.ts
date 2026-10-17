import fs from 'node:fs';
import path from 'node:path';
import type { ProfileContext } from '../../../core/paths/profile/context.js';
import { assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { openProfile } from '../../../config/profiles/context.js';
import { loadSessionRecord } from '../../../session/store/sessionStore.js';
import { projectSessionFileLayout } from '../../../session/store/sessionFileLayout.js';
import { checkSwitch, changeSwitch } from './store.js';
import { switchArgs, type SwitchReceipt } from './model.js';
import { createReport, span } from '../../../core/commands/report/projection.js';
import type { ReportWriter } from '../../../session/reports/model.js';

/** A dispatched receipt is claimed once, before bootstrap can create target state. */
export function claimSwitchChild(profile: ProfileContext, args: readonly string[], handoff: string | undefined): SwitchReceipt | undefined {
  if (handoff === undefined) return undefined;
  const match = /^([^:]+):([a-f0-9]{64})$/.exec(handoff);
  if (!match) throw new Error('Profile handoff binding is invalid.');
  const source = openProfile(match[1]!, profile.homeDir);
  return changeSwitch(source, match[2]!, current => {
    checkSwitch(current);
    const expected = switchArgs(current.plan);
    assertUnlinkedPath(path.join(profile.root, 'sessions', current.targetSessionId));
    if (current.status !== 'dispatched' || current.plan.target.root !== profile.root || current.plan.target.rootIdentity !== profile.rootIdentity
      || current.parentPid === process.pid || current.childPid !== undefined && current.childPid !== process.pid
      || args.length !== expected.length || args.some((arg, index) => arg !== expected[index])
      || fs.existsSync(path.join(profile.root, 'sessions', current.targetSessionId))) throw new Error('Profile handoff admission is stale or already claimed.');
    return { ...current, childPid: process.pid, status: 'admitting' };
  });
}

/** Native saved-session readback establishes startup; spawning alone cannot. */
export function verifySwitchSession(receipt: SwitchReceipt): void {
  checkSwitch(receipt);
  const target = receipt.plan.target;
  assertUnlinkedPath(path.join(target.root, 'sessions', receipt.targetSessionId));
  const saved = loadSessionRecord({ sessionId: receipt.targetSessionId, cwd: receipt.plan.workspace.path,
    layout: projectSessionFileLayout({ sessionsDir: path.join(target.root, 'sessions'), sessionId: receipt.targetSessionId }) });
  if (saved.id !== receipt.targetSessionId || saved.id === receipt.plan.sourceSessionId || saved.projectRoot !== receipt.plan.workspace.path) {
    throw new Error('Fresh target session readback is unverified.');
  }
  checkSwitch(receipt);
}
export function admitSwitchChild(receipt: SwitchReceipt, actualSessionId: string, writeReport: ReportWriter): void {
  if (actualSessionId !== receipt.targetSessionId) throw new Error('Fresh target session identity changed.');
  verifySwitchSession(receipt);
  // An explicitly admitted sitting has durable lifecycle meaning even before a
  // model turn. Existing report retention preserves it through an immediate exit.
  const report = createReport({ title: 'Profile startup',
    lines: [{ kind: 'text', spans: [span(`Started profile ${receipt.plan.target.id} in a fresh process.`)] }],
    facts: { operation: receipt.operation, profile: receipt.plan.target.id } });
  if (writeReport(report) !== 'saved') throw new Error('Profile startup report publication is unverified.');
  changeSwitch(receipt.plan.source, receipt.operation, current => {
    if (current.status !== 'admitting' || current.childPid !== process.pid || current.targetSessionId !== actualSessionId) throw new Error('Profile admission claim changed.');
    verifySwitchSession(current);
    return { ...current, status: 'admitted' };
  });
}
