import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ResearchRequest } from '../../../research/brief/model.js';
import type { readPromptPreview } from '../../../session/context/preview.js';
import { reserveResearchEntry, researchReservationCurrent, type ResearchReservation } from '../../../research/run/reservation.js';

interface PreviewEntry {
  readonly context: ShellRuntimeContext;
  readonly session: ShellRuntimeContext['session'];
  readonly publication: ShellRuntimeContext['configuration']['current'];
  readonly cwd: string;
  readonly reservation: ResearchReservation;
  readonly forcedTool: string | undefined;
  readonly attachments: string;
}
const entries = new WeakMap<ShellRuntimeContext, PreviewEntry>();

/** Publish one exact entry identity only after the complete local request was verified. */
export function prepareResearchPreview(context: ShellRuntimeContext, snapshot: Awaited<ReturnType<typeof readPromptPreview>>, request: ResearchRequest) {
  const { reservation, run } = reserveResearchEntry({ session: context.session, scope: snapshot.scope, state: snapshot.state,
    directoryIdentity: snapshot.directoryIdentity }, request);
  const entry = { context, session: context.session, publication: context.configuration.current, cwd: context.cwd, reservation,
    forcedTool: context.peekForcedTool?.(), attachments: JSON.stringify([context.contextAttachments, context.transientContextAttachments]) };
  const verify = () => {
    if (!current(entry) || !researchReservationCurrent(reservation, request)) throw new Error('Research entry preparation expired or changed.');
  };
  return { run, verify, publish: () => { verify(); entries.set(context, entry); } };
}

/** Submission still resolves methods again and admits state through the research owner. */
export function takeResearchPreview(context: ShellRuntimeContext, request: ResearchRequest): ResearchReservation | undefined {
  const entry = entries.get(context);
  entries.delete(context);
  if (!entry || !researchReservationCurrent(entry.reservation, request)) return undefined;
  if (!current(entry)) throw new Error('Research entry configuration or session changed before submission.');
  return entry.reservation;
}

function current(entry: PreviewEntry): boolean {
  return entry.context.session === entry.session && entry.context.cwd === entry.cwd
    && entry.context.configuration.current === entry.publication && entry.context.peekForcedTool?.() === entry.forcedTool
    && JSON.stringify([entry.context.contextAttachments, entry.context.transientContextAttachments]) === entry.attachments;
}
