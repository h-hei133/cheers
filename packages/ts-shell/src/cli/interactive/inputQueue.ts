import { inputQueueControl, PendingQueue, type InputQueueControl } from '../../core/agent/queue.js';
import type { Session } from '../../session/schema/sessionRecord.js';

interface PendingSubmission { readonly text: string; readonly sessionId: string; readonly createdAt: string; readonly projectRoot: string }

/** The host's actual pending submissions, bound when the person queued them. */
export class SubmissionQueue {
  private readonly pending = new PendingQueue<PendingSubmission>();
  readonly control: InputQueueControl;

  constructor(private readonly current: () => Session, private readonly refused: (text: string) => void) {
    this.control = inputQueueControl([{ lane: 'pending', queue: this.pending, text: value => value.text,
      replace: (value, text) => ({ ...value, text }) }]);
  }
  get length(): number { return this.pending.entries().length; }

  push(text: string): string {
    const session = this.current();
    return this.pending.enqueue({ text, sessionId: session.id, createdAt: session.createdAt, projectRoot: session.projectRoot });
  }

  shift(): string | undefined {
    while (this.pending.hasItems()) {
      const submission = this.pending.drain()[0]!;
      const session = this.current();
      if (session.id !== submission.sessionId || session.createdAt !== submission.createdAt || session.projectRoot !== submission.projectRoot) {
        this.refused(submission.text); continue;
      }
      return submission.text;
    }
    return undefined;
  }

  splice(_start: 0): string[] {
    const values = this.pending.entries().map(entry => entry.value.text); this.pending.clear(); return values;
  }

  cancelWhere(matches: (text: string) => boolean): void {
    for (const entry of this.pending.entries()) {
      if (matches(entry.value.text)) this.pending.cancel(entry.id);
    }
  }
}
