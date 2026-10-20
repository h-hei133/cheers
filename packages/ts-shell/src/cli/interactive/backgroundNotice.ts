import type { BackgroundTask } from '../../workflow/jobs/local/model.js';
import { redactReportText } from '../../core/security/redaction.js';

const OUTPUT_LIMIT = 4000;
const DEFAULT_BUDGET = 20;

/**
 * Decide whether a finished background task becomes a model follow-up.
 *
 * Off by default: a completion is a local notice, not a new model request. When
 * enabled, each task id is delivered once and a session spends at most
 * `budget` follow-ups, so a task that ends repeatedly cannot flood the turn.
 */
export function createBackgroundFollowUp(options: {
  readonly enabled: boolean | (() => boolean);
  readonly budget?: number;
}) {
  const seen = new Set<string>();
  let remaining = options.budget ?? DEFAULT_BUDGET;
  return (task: BackgroundTask): string | undefined => {
    const enabled = typeof options.enabled === 'function' ? options.enabled() : options.enabled;
    if (!enabled || task.state !== 'exited' || seen.has(task.id) || remaining <= 0) return undefined;
    seen.add(task.id); remaining--;
    const command = redactReportText(task.command, 500, { preserveLines: true });
    const output = redactReportText(task.output, OUTPUT_LIMIT, { preserveLines: true, ellipsis: true });
    const truncation = task.outputTruncated || task.output.length > OUTPUT_LIMIT ? '\n[output truncated]' : '';
    return `Background task ${task.id} finished (${command}). Output:\n${output}${truncation}`;
  };
}
