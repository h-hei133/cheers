import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ResearchRequest } from '../../../research/brief/model.js';
import type { readPromptPreview } from '../../../session/context/preview.js';
import { reserveResearchEntry, researchReservationCurrent, type ResearchReservation, type ResearchReservationAdmission } from '../../../research/run/reservation.js';
import { sameValue } from '../../../config/values.js';
import { attachmentBinding } from '../../../context/attachment/binding.js';
import type { PromptAttachments } from '../../../core/shell/sessionRuntime.js';

interface PreviewEntryBase {
  readonly context: ShellRuntimeContext;
  readonly session: ShellRuntimeContext['session'];
  readonly publication: ShellRuntimeContext['configuration']['current'];
  readonly cwd: string;
  readonly reservation: ResearchReservation;
  readonly request: ResearchRequest;
  readonly forcedTool: string | undefined;
  readonly attachments: string;
  readonly attachmentBinding: string;
}
interface PreviewEntry extends PreviewEntryBase {
  readonly verifyContent: (signal: AbortSignal) => Promise<void>;
}
const entries = new WeakMap<ShellRuntimeContext, PreviewEntry>();
const stale = new WeakSet<ShellRuntimeContext>();
const claims = new WeakMap<ShellRuntimeContext, object>();

/** Publish one exact entry identity only after the complete local request was verified. */
export function prepareResearchPreview(context: ShellRuntimeContext, snapshot: Awaited<ReturnType<typeof readPromptPreview>>, request: ResearchRequest,
  attachments?: PromptAttachments) {
  const { reservation, run, request: capturedRequest } = reserveResearchEntry({ session: context.session, scope: snapshot.scope, state: snapshot.state,
    directoryIdentity: snapshot.directoryIdentity }, request);
  const entry: PreviewEntryBase = { context, session: context.session, publication: context.configuration.current, cwd: context.cwd, reservation,
    request: capturedRequest,
    forcedTool: context.peekForcedTool?.(), attachments: JSON.stringify([context.contextAttachments, context.transientContextAttachments]),
    attachmentBinding: attachmentBinding(attachments) };
  let published: PreviewEntry | undefined;
  const verify = () => {
    if (!current(entry) || !researchReservationCurrent(reservation, request)) throw new Error('Research entry preparation expired or changed.');
  };
  return { run, verify,
    publish: (verifyContent: (signal: AbortSignal) => Promise<void>) => {
      verify(); claims.delete(context); published = { ...entry, verifyContent }; entries.set(context, published); stale.delete(context);
    },
    discard: () => {
      if (published && entries.get(context) === published) {
        entries.delete(context);
        stale.add(context);
      }
    } };
}

/** Submission still resolves methods again and admits state through the research owner. */
export async function takeResearchPreview(context: ShellRuntimeContext, request: ResearchRequest,
  signal?: AbortSignal, attachments?: PromptAttachments): Promise<ResearchReservationAdmission | undefined> {
  signal?.throwIfAborted();
  const entry = entries.get(context);
  entries.delete(context);
  if (entry) {
    if (!sameValue(request, entry.request)) {
      stale.add(context);
      throw new Error('Research entry request changed before submission; reopen the preview.');
    }
    if (entry.attachmentBinding !== attachmentBinding(attachments)) {
      stale.add(context);
      throw new Error('Research entry preparation changed; retry the original draft.');
    }
    if (!researchReservationCurrent(entry.reservation)) {
      stale.add(context);
      throw new Error('Research entry preparation expired or changed.');
    }
    if (!current(entry)) {
      stale.add(context);
      throw new Error('Research entry configuration or session changed before submission.');
    }
  } else {
    signal?.throwIfAborted();
    if (stale.has(context)) throw new Error('Research entry preparation expired or changed; reopen the preview.');
    return undefined;
  }
  const claim = {};
  claims.set(context, claim);
  stale.add(context);
  try {
    await entry.verifyContent(signal ?? new AbortController().signal);
    signal?.throwIfAborted();
    if (claims.get(context) !== claim || !current(entry) || !researchReservationCurrent(entry.reservation)
      || entry.attachmentBinding !== attachmentBinding(attachments)) {
      stale.add(context);
      throw new Error('Research entry preparation expired or changed.');
    }
    return { reservation: entry.reservation, commit: () => {
      if (claims.get(context) !== claim) return;
      claims.delete(context);
      stale.delete(context);
    } };
  } catch (error) {
    if (signal?.aborted) {
      if (claims.get(context) === claim) claims.delete(context);
    } else stale.add(context);
    throw error;
  }
}

/** Drop an unpublished or invalidated research entry without touching a newer owner. */
export function clearResearchPreview(context: ShellRuntimeContext): void {
  claims.delete(context);
  const entry = entries.get(context);
  entries.delete(context);
  if (entry) stale.add(context);
}

function current(entry: PreviewEntryBase): boolean {
  return entry.context.session === entry.session && entry.context.cwd === entry.cwd
    && entry.context.configuration.current === entry.publication && entry.context.peekForcedTool?.() === entry.forcedTool
    && JSON.stringify([entry.context.contextAttachments, entry.context.transientContextAttachments]) === entry.attachments;
}
