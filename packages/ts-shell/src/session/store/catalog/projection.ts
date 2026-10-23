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
  const conversation = sessionPreview(session);
  return {
    id: session.id, projectRoot: session.projectRoot,
    ...(session.pinned === true ? { pinned: true } : {}),
    // Metadata acquisition already bounds this value; clipping belongs to presentation.
    title: session.title?.trim() || (preview ? deriveSessionTitleFromPrompt(preview) : '') || 'New session',
    titleComplete: Boolean(session.title?.trim()) || !limited,
    createdAt: session.createdAt, updatedAt: session.updatedAt, status: session.status,
    reentry: sessionHasReentrySurface(session) ? 'available' : limited ? 'unknown' : 'empty',
    quality: limited ? 'limited' : 'complete', ...(conversation ? { preview: conversation } : {}), version,
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
  if (!state) return { id, projectRoot: root, title: metadata.title, ...(metadata.pinned === true ? { pinned: true } : {}), titleComplete: Boolean(metadata.title?.trim()), createdAt: metadata.createdAt,
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

function sessionPreview(session: Session): SessionSummary['preview'] | undefined {
  const prompt = session.turns.find(turn => turn.role === 'user' && messageToText(turn.content).trim());
  let answer: (typeof session.turns)[number] | undefined;
  for (let index = session.turns.length - 1; index >= 0; index--) {
    const turn = session.turns[index]!;
    if (turn.role === 'assistant' && messageToText(turn.content).trim()) { answer = turn; break; }
  }
  const promptText = boundedText(messageToText(prompt?.content) || session.pendingPrompt || '');
  const answerText = boundedText(messageToText(answer?.content), true);
  return promptText || answerText
    ? { ...(promptText ? { prompt: promptText } : {}), ...(answerText ? { answer: answerText } : {}) }
    : undefined;
}

function boundedText(value: string, tail = false): string {
  const limit = 1200;
  const head: string[] = [];
  const window = tail ? new Array<string>(limit) : undefined;
  let windowIndex = 0;
  let total = 0;
  let pendingSpace = false;
  const append = (point: string): void => {
    if (head.length < limit) head.push(point);
    if (window) {
      window[windowIndex] = point;
      windowIndex = (windowIndex + 1) % limit;
    }
    total += 1;
  };
  for (const point of value) {
    if (point.trim() === '') {
      if (total > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) append(' ');
    pendingSpace = false;
    append(point);
    if (!tail && total > limit) break;
  }
  if (total === 0) return '';
  if (!tail) return total > limit ? head.join('') : head.slice(0, total).join('');
  const points = total < limit ? window!.slice(0, total)
    : [...window!.slice(windowIndex), ...window!.slice(0, windowIndex)];
  return total > limit ? `…${points.join('')}` : points.join('');
}
