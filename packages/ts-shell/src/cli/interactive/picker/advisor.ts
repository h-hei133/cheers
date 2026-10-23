import type { AdvisorState } from '../../../advisor/model.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { sameValue } from '../../../config/values.js';
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
export function advisorPicker(state: AdvisorState, readCurrent: () => AdvisorState | undefined = () => state): Picker {
  const details = new Map<string, readonly string[]>();
  const text = (value: string): string => neutraliseForDisplay(redactReportText(value, 8000, { preserveLines: true }));
  const metadata = (value: string): string => neutraliseForDisplay(redactReportText(value, 512));
  let current = true;
  const refreshCurrent = (): boolean => {
    try { current = sameValue(readCurrent(), state); } catch { current = false; }
    return current;
  };
  return {
    title: `Advisor — ${state.status}`,
    form: 'panel',
    empty: 'No advisor checkpoints or notes are retained.',
    isCurrent: () => current,
    status: () => current ? undefined : 'Advisor state changed. Reopen /advisor.',
    async load(): Promise<readonly Option[]> {
      if (!refreshCurrent()) return [];
      details.clear();
      const rows: Option[] = [];
      for (const checkpoint of state.checkpoints) {
        const id = `checkpoint:${checkpoint.id}`;
        details.set(id, [
          `Checkpoint ${metadata(checkpoint.id)}`,
          `Source prompt: ${metadata(checkpoint.sourcePromptEntryId)}`,
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
          `Note ${metadata(note.id)}`,
          `Target: ${metadata(note.target)}; epoch ${note.epoch}`,
          `Checkpoint: ${metadata(note.checkpointId)} (${note.checkpointDigest})`,
          `Coverage: ${note.coverage.checkpoints.length} boundaries${note.coverage.truncated ? ' (truncated)' : ''}`,
          note.submittedAt ? `Submitted to the ordinary prompt path at ${note.submittedAt}.` : 'Not applied.',
          text(note.text),
        ]);
        rows.push({ id, label: `Note ${metadata(note.id).slice(0, 8)}`,
          detail: `target ${metadata(note.target)} · epoch ${note.epoch}`, note: note.submittedAt ? 'submitted' : 'unapplied' });
      }
      return rows;
    },
    detail: id => (id ? details.get(id) ?? [] : []),
    async apply() {
      if (!refreshCurrent()) return undefined;
      return { note: 'Read-only view. Use /advisor to enable, retry or apply; advice never writes or approves by itself.' };
    },
  };
}
