import { neutraliseForDisplay } from '../../core/text/safety.js';
import { createUnifiedDiff, type DiffFacts } from '../../presentation/tui/transcript/diff.js';

/** Quote changed text so controls and line-ending markers remain visible in an approval. */
export function editDiff(file: string, before: string, after: string, facts?: DiffFacts): string {
  return createUnifiedDiff(file, before, after, facts).split('\n').map(line => /^[ +\-]/.test(line)
    ? line[0] + JSON.stringify(line.slice(1)).replace(/[\u0080-\u009f\u2028\u2029]/g,
      character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    : neutraliseForDisplay(line)).join('\n');
}
