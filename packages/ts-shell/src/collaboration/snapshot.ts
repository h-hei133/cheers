import { decodeFrame as decodeRelayFrame, decodeSnapshot as decodeRelaySnapshot,
  projectSnapshot as projectRelaySnapshot } from '@cheers/collaboration';
import { redactExportText } from '../core/security/redaction.js';
import type { ExportPayload } from '../session/export/model.js';

export function decodeFrame(value: unknown) { return decodeRelayFrame(value, redactExportText); }
export function decodeSnapshot(value: unknown) { return decodeRelaySnapshot(value, redactExportText); }
export function projectSnapshot(payload: ExportPayload, cutover: number) {
  return projectRelaySnapshot(payload, cutover, redactExportText);
}
