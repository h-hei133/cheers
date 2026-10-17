import fs from 'node:fs';
import { assertProfileIdentity, type ProfileContext } from '../../../core/paths/profile/context.js';
import { assertUnlinkedPath, directoryIdentity, isWithin } from '../../../core/paths/profile/identity.js';
import type { ProfileSwitchPort } from '../../../core/commands/profile/contract.js';
import { openProfile } from '../../../config/profiles/context.js';
import { MAX_SWITCH_DEPTH, switchDigest, type SwitchPlan, type SwitchTicket } from './model.js';
import { prepareSwitch, readSwitch } from './store.js';

/** Bootstrap captures its real runtime generation; commands only request retirement. */
export function profileSwitchPort(input: {
  readonly source: ProfileContext;
  readonly interactive: boolean;
  readonly depth: number;
  readonly current: () => { readonly sessionId: string; readonly generation: string; readonly workspace: string; readonly cwd: string; readonly offline: boolean };
  readonly busy: () => boolean;
  readonly pending: () => boolean;
  readonly admission: () => string | undefined;
  readonly executableAvailable: () => void;
  readonly retire: (ticket: SwitchTicket) => void;
}): ProfileSwitchPort {
  return {
    async request(request) {
      if (!input.interactive) return { status: 'unavailable', reason: 'A profile switch requires an interactive terminal.' };
      if (!Number.isSafeInteger(input.depth) || input.depth < 0 || input.depth >= MAX_SWITCH_DEPTH) {
        return { status: 'unavailable', reason: 'This terminal has reached its eight-switch limit. Exit and start a new CLI process before switching again.' };
      }
      if (request.signal?.aborted || input.pending() || input.busy() || input.admission()) return { status: 'unavailable', reason: 'The source is busy, cancelled, stale or already retiring.' };
      try {
        assertProfileIdentity(input.source); input.executableAvailable();
        const current = input.current();
        if (current.sessionId !== request.sessionId) throw new Error('Session changed.');
        assertUnlinkedPath(current.workspace); assertUnlinkedPath(current.cwd);
        const target = openProfile(request.target, input.source.homeDir);
        if (target.root === input.source.root) return { status: 'unavailable', reason: 'The selected profile is already active.' };
        const plan: SwitchPlan = { version: 1, source: input.source, target, workspace: directoryIdentity(fs.realpathSync(current.workspace)),
          workingDirectory: directoryIdentity(fs.realpathSync(current.cwd)), sourceSessionId: current.sessionId, generation: current.generation, depth: input.depth + 1, offline: current.offline };
        if (!isWithin(plan.workspace.path, plan.workingDirectory.path)) throw new Error('Working directory changed scope.');
        const digest = switchDigest(plan);
        if (request.confirmation === undefined) return { status: 'preview', digest, target: target.id };
        if (request.confirmation !== digest) return { status: 'unavailable', reason: 'The exact current switch preview must be confirmed.' };
        const receipt = prepareSwitch(plan);
        const checkSource = () => {
          const actual = input.current();
          assertProfileIdentity(input.source);
          if (request.signal?.aborted || input.busy() || input.admission() || actual.sessionId !== plan.sourceSessionId || actual.generation !== plan.generation
            || actual.workspace !== current.workspace || actual.cwd !== current.cwd) throw new Error('Source generation or admission changed.');
        };
        checkSource();
        if (input.pending()) throw new Error('Source already retiring.');
        input.retire({ kind: 'profile-switch', source: input.source, operation: receipt.operation, checkSource });
        return { status: 'requested', operation: receipt.operation };
      } catch {
        return { status: 'unavailable', reason: 'The profile, runtime, executable or retained handoff could not be verified. No new process was admitted.' };
      }
    },
    inspect(operation) {
      const receipt = readSwitch(input.source, operation);
      return receipt ? `Profile switch retained state: ${receipt.status}. Operation: ${operation}. Dispatch is never replayed automatically; the source session remains available for explicit resume.`
        : 'No switch operation exists in the source profile.';
    },
  };
}
