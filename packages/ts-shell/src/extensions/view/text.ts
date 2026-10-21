import { neutraliseForDisplay } from '../../core/text/safety.js';
import { redactReportText } from '../../core/security/redaction.js';

export function safeText(value: string): string {
  return neutraliseForDisplay(redactReportText(value, 2048));
}
export function safeLines(value: string): readonly string[] {
  return redactReportText(value, 16384, { preserveLines: true, ellipsis: true }).split('\n').map(neutraliseForDisplay);
}
