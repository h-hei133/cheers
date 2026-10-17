import type { BackgroundTask } from '../../workflow/jobs/local/model.js';

const OUTPUT_LIMIT = 4000;
const DEFAULT_BUDGET = 20;

/**
 * Decide whether a finished background task becomes a model follow-up.
 *
 * Off by default: a completion is a local notice, not a new model request. When
 * enabled, each task id is delivered once and a session spends at most
 * `budget` follow-ups, so a task that ends repeatedly cannot flood the turn.
 */
export function createBackgroundFollowUp(options: { readonly enabled: boolean; readonly budget?: number }) {
  const seen = new Set<string>();
  let remaining = options.budget ?? DEFAULT_BUDGET;
  return (task: BackgroundTask): string | undefined => {
    if (!options.enabled || task.state !== 'exited' || seen.has(task.id) || remaining <= 0) return undefined;
    seen.add(task.id); remaining--;
    const output = task.output.length > OUTPUT_LIMIT ? `${task.output.slice(0, OUTPUT_LIMIT)}\n[output truncated]` : task.output;
    return `Background task ${task.id} finished (${task.command}). Output:\n${output}`;
  };
}
