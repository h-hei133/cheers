import fs from 'node:fs';
import { gatherExport } from '../../session/export/collect.js';
import { readExportSource } from '../../session/export/source.js';
import { projectSnapshot } from '../../collaboration/contract/snapshot.js';
import { digest, identifier, requireValue } from '../../collaboration/contract/value.js';
import type { Binding, Snapshot, Right } from '../../collaboration/contract/model.js';
import type { CollaborationComposition } from './model.js';
import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';

export function currentBinding(host: CollaborationComposition): Binding {
  const session = host.context.session; const root = fs.realpathSync(host.context.projectRoot); const stat = fs.statSync(root);
  return { sessionId: session.id, sessionCreatedAt: session.createdAt, projectId: digest([root, stat.dev, stat.ino]) };
}
export function snapshotFor(host: CollaborationComposition, cutover = 0): Snapshot {
  const gathered = gatherExport({ sessionId: host.context.session.id, workspace: host.context.projectRoot, maxSourceBytes: 2 * 1024 * 1024 });
  if (gathered.ok) return projectSnapshot(gathered.payload, cutover);
  const source = readExportSource(host.context.session.id, 2 * 1024 * 1024);
  requireValue(source.ok && source.transcript.events.length === 0 && !source.transcript.unreadableLines, 'unavailable');
  return { version: 1, consistency: 'partial', cutover, entries: [], warnings: ['No recorded conversation; active output and opaque attachments are omitted.'] };
}
export function display(value: unknown, limit = 4096): string {
  const redactions = new Set<string>();
  const shown = neutraliseForDisplay(redactReportText(typeof value === 'string' ? value : JSON.stringify(value, null, 2), limit, { preserveLines: true, redactions }));
  return shown.slice(0, limit) + (redactions.has('truncated') || shown.length > limit ? '\n[Display excerpt shortened.]' : '');
}
export function snapshotPreview(snapshot: Snapshot): string {
  return `Scrubbed text projection: ${snapshot.entries.length} entries, ${Buffer.byteLength(JSON.stringify(snapshot))} UTF-8 bytes; partial source consistency.\nDigest: ${digest(snapshot)}\n${display(snapshot)}`;
}
/** Each bounded principal gets a separate trusted row; recipients are never excerpted. */
export function aclPreview(acl: Readonly<Record<string, readonly Right[]>>): string {
  return Object.entries(acl).map(([principal, rights]) => `- ${identifier(principal)}: ${rights.join(', ') || 'no rights'}`).join('\n') || 'No guest rights.';
}
/** A proposal is approval-critical: retain its complete scrubbed text in short marked rows. */
export function promptPreview(prompt: string): string {
  const shown = neutraliseForDisplay(redactReportText(prompt, 64 * 1024, { preserveLines: true }));
  return (shown.match(/.{1,512}/gu) ?? []).map(row => `│ ${row}`).join('\n');
}
