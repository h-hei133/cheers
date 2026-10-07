import { messageToText } from '../../../model-adapters/multimodal.js';
import { deriveSessionTitleFromPrompt } from '../../lifecycle/sessionLifecycleStore.js';
import { sessionHasReentrySurface } from '../../presentation/sessionReentrySurface.js';
import { selectSessionReports } from '../../reports/projection.js';
import type { SessionMetadata } from '../../schema/sessionMetadataCodec.js';
import type { Session } from '../../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../../schema/sessionStateSnapshot.js';
import { sessionThreadPath } from '../../schema/sessionThread.js';
import { parseTranscript, projectBranchMessages } from '../../transcript/sessionTranscript.js';
import { projectLoadedSession } from '../sessionStore.js';
import type { SessionSummary } from './model.js';

export function summarizeSession(session: Session, version: string, limited = false): SessionSummary {
  const first = session.turns.find(turn => (turn.role === 'user' || turn.role === 'assistant') && messageToText(turn.content).trim());
  const preview = messageToText(first?.content) || session.pendingPrompt;
  return {
    id: session.id, projectRoot: session.projectRoot,
    title: (session.title?.trim() || (preview ? deriveSessionTitleFromPrompt(preview) : '') || 'New session').slice(0, 512),
    createdAt: session.createdAt, updatedAt: session.updatedAt, status: session.status,
    reentry: sessionHasReentrySurface(session) ? 'available' : limited ? 'unknown' : 'empty',
    quality: limited ? 'limited' : 'complete', version,
  };
}

export function decodeSessionSummary(id: string, metadataText: string, stateText: string | undefined,
  transcriptText: string | undefined, version: string): SessionSummary {
  const metadata = JSON.parse(metadataText.trim()) as SessionMetadata;
  if (!metadata || metadata.id !== id || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt))
    || typeof metadata.updatedAt !== 'string' || !Number.isFinite(Date.parse(metadata.updatedAt))
    || (metadata.title !== undefined && typeof metadata.title !== 'string')) throw new Error('Invalid session metadata.');
  const state = stateText === undefined ? undefined : JSON.parse(stateText.trim()) as SessionStateSnapshot;
  if (stateText !== undefined && (!state || !['active', 'interrupted', 'completed', 'error', 'terminated'].includes(state.status)
    || (state.pendingPrompt !== undefined && typeof state.pendingPrompt !== 'string'))) throw new Error('Invalid session state.');
  const root = typeof metadata.projectRoot === 'string' && metadata.projectRoot.trim()
    || (typeof state?.projectRoot === 'string' && state.projectRoot.trim());
  // A missing workspace identity cannot be inferred from the project doing the listing.
  if (!root) throw new Error('Session project identity is unavailable.');
  if (!state) return { id, projectRoot: root, title: metadata.title?.slice(0, 512), createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt, reentry: 'unknown', quality: 'limited', version };
  const transcript = transcriptText === undefined ? undefined : parseTranscript(transcriptText);
  const selected = state.thread === undefined ? undefined : sessionThreadPath(state.thread);
  const events = transcript?.events ?? [];
  const turns = projectBranchMessages(events, selected?.resolved ? selected.path.map(entry => entry.id) : undefined,
    state.thread?.entries.map(entry => entry.id));
  const session = projectLoadedSession({ metadata, state, turns, cwd: root });
  session.hasReportHistory = events.some(event => event.type === 'command-output');
  const reports = selectSessionReports(events, id, state.thread);
  const latest = reports.at(-1)?.timestamp;
  if (latest && Date.parse(latest) > Date.parse(session.updatedAt)) session.updatedAt = latest;
  return summarizeSession(session, version, transcript === undefined || transcript.warnings.length > 0);
}
