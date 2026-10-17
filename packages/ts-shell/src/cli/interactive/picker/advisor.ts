import type { AdvisorState } from '../../../advisor/model.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker } from '../overlay.js';

/**
 * Read-only advisor inspector.
 *
 * Shows retained checkpoints and notes with their target, epoch and coverage so
 * a reader can tell which boundary an advice note came from. Opening it starts
 * no model, submits nothing and applies nothing: enabling, retrying and applying
 * stay with `/advisor`, each through its own explicit path.
 */
export function advisorPicker(state: AdvisorState): Picker {
  const details = new Map<string, readonly string[]>();
  const text = (value: string): string => neutraliseForDisplay(redactReportText(value, 8000, { preserveLines: true }));
  return {
    title: `Advisor — ${state.status}`,
    form: 'panel',
    empty: 'No advisor checkpoints or notes are retained.',
    async load(): Promise<readonly Option[]> {
      details.clear();
      const rows: Option[] = [];
      for (const checkpoint of state.checkpoints) {
        const id = `checkpoint:${checkpoint.id}`;
        details.set(id, [
          `Checkpoint ${checkpoint.id}`,
          `Source prompt: ${checkpoint.sourcePromptEntryId}`,
          `Step: ${checkpoint.step}; ${checkpoint.willContinue ? 'continuing' : 'end of turn'}`,
          `Digest: ${checkpoint.digest}`,
          ...(checkpoint.failed ? ['The checkpoint is marked failed.'] : []),
          ...(checkpoint.truncated ? ['Captured text is explicitly truncated.'] : []),
          text(checkpoint.text),
        ]);
        rows.push({ id, label: `Checkpoint ${checkpoint.id.slice(0, 8)}`, detail: `step ${checkpoint.step} · ${checkpoint.willContinue ? 'continuing' : 'end'}`, note: checkpoint.failed ? 'failed' : 'captured' });
      }
      for (const note of state.notes) {
        const id = `note:${note.id}`;
        details.set(id, [
          `Note ${note.id}`,
          `Target: ${note.target}; epoch ${note.epoch}`,
          `Checkpoint: ${note.checkpointId} (${note.checkpointDigest})`,
          `Coverage: ${note.coverage.checkpoints.length} boundaries${note.coverage.truncated ? ' (truncated)' : ''}`,
          note.submittedAt ? `Submitted to the ordinary prompt path at ${note.submittedAt}.` : 'Not applied.',
          text(note.text),
        ]);
        rows.push({ id, label: `Note ${note.id.slice(0, 8)}`, detail: `target ${note.target} · epoch ${note.epoch}`, note: note.submittedAt ? 'submitted' : 'unapplied' });
      }
      return rows;
    },
    detail: id => (id ? details.get(id) ?? [] : []),
    async apply() {
      return { note: 'Read-only view. Use /advisor to enable, retry or apply; advice never writes or approves by itself.' };
    },
  };
}
