import { inputQueueControl, PendingQueue, type InputQueueControl } from '../../core/agent/queue.js';
import type { Session } from '../../session/schema/sessionRecord.js';

export interface PendingSubmission { readonly text: string; readonly sessionId: string; readonly createdAt: string; readonly projectRoot: string;
  readonly attachments?: import('../../core/shell/sessionRuntime.js').PromptAttachments }

/** The host's actual pending submissions, bound when the person queued them. */
export class SubmissionQueue {
  private readonly pending = new PendingQueue<PendingSubmission>();
  private deliveredAttachments?: PendingSubmission['attachments'];
  readonly control: InputQueueControl;

  constructor(private readonly current: () => Session, private readonly refused: (text: string, attachments?: PendingSubmission['attachments']) => void) {
    this.control = inputQueueControl([{ lane: 'pending', queue: this.pending, text: value => value.text,
      replace: (value, text) => ({ ...value, text }) }]);
  }
  get length(): number { return this.pending.entries().length; }

  push(text: string, attachments?: PendingSubmission['attachments']): string {
    const session = this.current();
    return this.pending.enqueue({ text, sessionId: session.id, createdAt: session.createdAt, projectRoot: session.projectRoot,
      ...(attachments ? { attachments } : {}) });
  }

  shift(): string | undefined {
    this.deliveredAttachments = undefined;
    while (this.pending.hasItems()) {
      const submission = this.pending.drain()[0]!;
      const session = this.current();
      if (session.id !== submission.sessionId || session.createdAt !== submission.createdAt || session.projectRoot !== submission.projectRoot) {
        if (submission.attachments) this.refused(submission.text, submission.attachments);
        else this.refused(submission.text);
        continue;
      }
      this.deliveredAttachments = submission.attachments;
      return submission.text;
    }
    return undefined;
  }

  takeAttachments(): PendingSubmission['attachments'] {
    const attachments = this.deliveredAttachments; this.deliveredAttachments = undefined; return attachments;
  }

  splice(_start: 0): string[] {
    return this.release().map(value => value.text);
  }

  release(): PendingSubmission[] {
    const values = this.pending.entries().map(entry => entry.value); this.pending.clear(); return values;
  }

  cancelWhere(matches: (text: string) => boolean): void {
    for (const entry of this.pending.entries()) {
      if (matches(entry.value.text)) this.pending.cancel(entry.id);
    }
  }
}
