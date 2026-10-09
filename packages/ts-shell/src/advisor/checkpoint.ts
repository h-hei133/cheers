import { randomUUID } from 'node:crypto';
import { textDigest } from '../planning/plan/codec.js';
import { advisorGoal } from './binding.js';
import { messageToText } from '../model-adapters/multimodal.js';
import { redactExportText } from '../core/security/redaction.js';
import { neutraliseForDisplay } from '../core/text/safety.js';
import type { Session } from '../session/schema/sessionRecord.js';
import type { AdvisorStore, AdvisorEdit } from './store.js';
import type { AdvisorBoundary, AdvisorCheckpoint } from './model.js';

export function advisorText(value: string, limit: number): string { return neutraliseForDisplay(redactExportText(value)).slice(-limit); }
export function transcriptFrontier(store: AdvisorStore, session: Session): string {
  return textDigest(JSON.stringify(store.getTranscriptEvents(session.id).filter(event => event.type === 'message')));
}
/** Render immediately at the native boundary so later context pruning cannot change the captured input. */
export function captureAdvisorCheckpoint(store: AdvisorStore, session: Session, edit: AdvisorEdit, boundary: AdvisorBoundary): AdvisorCheckpoint {
  const origins = store.getTranscriptEvents(session.id).filter(event => event.type === 'message' && event.id === boundary.sourcePromptEntryId);
  if (origins.length !== 1 || origins[0]?.type !== 'message' || origins[0].role !== 'user') throw new Error('Advisor checkpoint source is unverified.');
  const rendered = boundary.messages.map(message => `${message.role}: ${messageToText(message.content)}${message.tool_calls?.length
    ? `\nTool calls: ${JSON.stringify(message.tool_calls)}` : ''}`).join('\n\n');
  const text = advisorText(rendered, 32768) || '[empty checkpoint]';
  const checkpoint = { id: randomUUID(), timestamp: new Date().toISOString(), sourcePromptEntryId: boundary.sourcePromptEntryId,
    step: boundary.step, willContinue: boundary.willContinue, failed: boundary.failed, text, truncated: rendered.length > 32768,
    frontier: transcriptFrontier(store, session), goal: advisorGoal(edit.bound.state) };
  return { ...checkpoint, digest: textDigest(JSON.stringify(checkpoint)) };
}
