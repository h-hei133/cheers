import type { SessionSummary } from '../../../../session/store/catalog/model.js';
import type { SessionFileSize } from '../../../../session/store/files.js';
import { sessionSizeLabel } from '../../../../session/presentation/size.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

const PREVIEW_CHUNK = 30;

/** Facts available in the bounded catalog projection for the focused session. */
export function sessionPreview(session: SessionSummary, size: SessionFileSize | undefined, currentId: string): readonly string[] {
  return [
    session.id === currentId ? 'Current session' : 'Selected session',
    displayText(session.title?.trim() || 'New session'),
    `Project: ${displayText(session.projectRoot)}`,
    `Status: ${displayText(session.status ?? 'unknown')} · Re-entry: ${session.reentry}`,
    `Updated: ${timestamp(session.updatedAt)} · Created: ${timestamp(session.createdAt)}`,
    `Files: ${sessionSizeLabel(size)} · ${session.quality === 'complete' ? 'complete preview' : 'limited preview'}${session.pinned ? ' · pinned' : ''}`,
    `Identity: ${session.id}`,
    ...previewRows('Prompt:', session.preview?.prompt, false, session.preview?.answer ? 2 : 3),
    ...previewRows('Latest answer:', session.preview?.answer, true, 1),
  ];
}

function previewRows(label: string, text: string | undefined, tail: boolean, maxChunks: number): readonly string[] {
  if (!text) return [];
  const points = Array.from(displayText(text));
  const selected = tail
    ? points.slice(Math.max(0, points.length - maxChunks * PREVIEW_CHUNK))
    : points.slice(0, maxChunks * PREVIEW_CHUNK);
  const chunks: string[] = [];
  for (let offset = 0; offset < selected.length; offset += PREVIEW_CHUNK) {
    chunks.push(selected.slice(offset, offset + PREVIEW_CHUNK).join(''));
  }
  return [label, ...chunks];
}

export function displayText(value: string): string {
  return stripAnsi(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

function timestamp(value: string): string {
  const at = Date.parse(value);
  return Number.isNaN(at) ? 'unknown' : new Date(at).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}
