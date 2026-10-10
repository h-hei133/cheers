import fs from 'node:fs';
import path from 'node:path';
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js';
import { bindExecutionTarget, executionWorkspace } from '../../runtime/execution/binding.js';
import { audioPrograms, audioArguments } from '../../media/live/devices.js';
import type { LiveOptions } from '../../media/live/model.js';
import type { JobsComposition } from '../jobs/model.js';

function identity(program: string): string {
  const canonical = fs.realpathSync(program); const stat = fs.statSync(canonical);
  if (!stat.isFile()) throw new Error('Voice executable is not a regular file.');
  return JSON.stringify([canonical, stat.dev, stat.ino, stat.birthtimeMs, stat.size, stat.mtimeMs, stat.ctimeMs]);
}
/** One explicit device macro approval covers these two literal, bound selections. */
export function liveDeviceAuthority(host: JobsComposition, options: LiveOptions) {
  const programs = audioPrograms();
  const selections = [
    { command: programs.capture, args: audioArguments(options.captureDevice) },
    { command: programs.playback, args: audioArguments(options.playbackDevice) },
  ];
  const versions = selections.map(selected => identity(selected.command));
  for (const selected of selections) bindExecutionTarget(selected, selected, host.context.cwd);
  const verify = (program: string, device: string): void => {
    const index = selections.findIndex(selected => selected.command === program && JSON.stringify(selected.args) === JSON.stringify(audioArguments(device)));
    const selected = selections[index]; if (!selected) throw new Error('Unapproved voice device selection.');
    if (identity(program) !== versions[index]) throw new Error('Voice executable changed after approval.');
    executionWorkspace(selected, selected, host.context.cwd);
    const gate = host.gate('bash'); const blocked = gate.admission?.(); if (blocked) throw new Error(blocked);
    for (const command of [program, path.basename(program)]) {
      const decision = evaluateToolPermissionScope('bash', { command: [command, ...selected.args].join(' ') },
        gate.permissionScope, gate.workspaceRoot, gate.denyRules);
      if (decision.denied) throw new Error(decision.reason);
    }
  };
  verify(programs.capture, options.captureDevice); verify(programs.playback, options.playbackDevice);
  return { programs, selections, verify, cwd: executionWorkspace(selections[0]!, selections[0], host.context.cwd) };
}
