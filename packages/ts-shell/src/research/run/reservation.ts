import { createHash, randomUUID } from 'node:crypto';
import { sameValue } from '../../config/values.js';
import { freezeDeep } from '../../core/values/freeze.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../../session/schema/sessionStateSnapshot.js';
import type { BoundSessionScope } from '../../session/store/contract.js';
import type { ResearchRequest } from '../brief/model.js';
import { researchStateFor } from './store.js';
import { prepareResearchRun } from './preparation.js';
import { decodeResearchState } from './codec.js';
import { historyDigest } from '../../context/request/identity.js';

export interface ResearchReservation { readonly id: string }
interface Capture {
  readonly session: Session;
  readonly scope: BoundSessionScope;
  readonly state: SessionStateSnapshot;
  readonly directoryIdentity: string;
}
interface ReservationOwner {
  readonly capture: Omit<Capture, 'state'>;
  readonly request: ResearchRequest;
  readonly stateDigest: string;
  readonly expiresAt: number;
  readonly history: string;
  readonly binding: string;
  consumed: boolean;
}
const owners = new WeakMap<ResearchReservation, ReservationOwner>();
const digest = (state: SessionStateSnapshot) => createHash('sha256')
  .update(JSON.stringify([state.research, state.goal, state.requestLedger, state.contextSelection,
    state.contextAttachments, state.workspaceRoots, state.modelSelection, state.modelRevision, state.workingMemory])).digest('hex');
const binding = (session: Session) => JSON.stringify([session.id, session.createdAt, session.projectRoot,
  session.workspaceRoots, session.contextSelection]);

/** The token carries an identity only; it does not arm or persist a native run. */
export function reserveResearchEntry(capture: Capture, request: ResearchRequest) {
  const state = researchStateFor(capture.scope, capture.state.research);
  const current = state.runs.find(run => run.id === state.currentId);
  if (current?.pending || current?.owner) throw new Error('Research has a pending owner or child outcome.');
  const ledger = capture.state.requestLedger === undefined ? undefined : decodeRequestLedger(capture.state.requestLedger);
  if (capture.state.requestLedger !== undefined && (!ledger || ledger.sessionId !== capture.scope.sessionId
    || ledger.sessionCreatedAt !== capture.scope.sessionCreatedAt || ledger.directoryIdentity !== capture.directoryIdentity)) {
    throw new Error('Research request scope is unavailable.');
  }
  const id = randomUUID();
  const reservation = Object.freeze({ id });
  const detached = freezeDeep(structuredClone(request));
  const run = prepareResearchRun({ scope: capture.scope, goal: capture.state.goal }, detached, { id, now: Date.now() });
  if (!decodeResearchState({ ...state, currentId: id, runs: [...state.runs, run].slice(-4) })) {
    throw new Error('Research entry request is invalid.');
  }
  owners.set(reservation, { capture: { session: capture.session, scope: freezeDeep(structuredClone(capture.scope)),
    directoryIdentity: capture.directoryIdentity }, request: detached,
    stateDigest: digest(capture.state), history: historyDigest(capture.session.turns), binding: binding(capture.session),
    expiresAt: Date.now() + 20000, consumed: false });
  return { reservation, run };
}

export function researchReservationCurrent(reservation: ResearchReservation, request?: ResearchRequest): boolean {
  const owner = owners.get(reservation);
  return !!owner && !owner.consumed && Date.now() < owner.expiresAt && (!request || sameValue(request, owner.request));
}

/** Consume once, then revalidate the capture again under the original publication lock. */
export function admitResearchReservation(reservation: ResearchReservation, capture: Capture, request: ResearchRequest) {
  const owner = owners.get(reservation);
  if (!owner || !researchReservationCurrent(reservation, request)) throw new Error('Research entry preparation expired or changed.');
  owner.consumed = true;
  if (capture.session !== owner.capture.session || !sameValue(capture.scope, owner.capture.scope)
    || capture.directoryIdentity !== owner.capture.directoryIdentity || digest(capture.state) !== owner.stateDigest
    || historyDigest(capture.session.turns) !== owner.history || binding(capture.session) !== owner.binding) {
    throw new Error('Research entry preparation changed before submission.');
  }
  return { id: reservation.id, guard: (current: SessionStateSnapshot) => digest(current) === owner.stateDigest };
}
