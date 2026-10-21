import { redactReportPaths } from '../../security/paths.js';
import { redactReportText } from '../../security/redaction.js';
import { plainReportText } from './projection.js';

/** Decode file paths between plain passes so later renderers cannot join secret fragments. */
export function reportMetadata(value: string, projectRoot: string, maxLength = 4096, preserveLines = false): string {
  const canonical = plainReportText(value.replace(/\r\n/g, '\n'));
  const paths = redactReportPaths(canonical, projectRoot);
  // Do not decode paths again after this pass: UTF-8 file URL escapes may have
  // introduced terminal controls that must be removed before secret matching.
  return redactReportText(plainReportText(paths), maxLength, { preserveLines });
}
