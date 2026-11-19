import { inputQueueControl, PendingQueue, type InputQueueControl } from '../../core/agent/queue.js';
import type { Session } from '../../session/schema/sessionRecord.js';
import type { ImageContent } from '../../model-adapters/multimodal.js';
import type { TurnInput } from '../../turn/session.js';

export interface PendingSubmission { readonly text: string; readonly sessionId: string; readonly createdAt: string; readonly projectRoot: string;
  readonly source?: import('../../core/shell/input/contract.js').PromptInputRequest['source'];
  readonly attachments?: import('../../core/shell/sessionRuntime.js').PromptAttachments }

export function recoverQueuedDrafts(input: TurnInput | undefined, queue: SubmissionQueue, hold: (image: ImageContent) => string): string[] {
  const restore = (text: string, images: readonly ImageContent[] = []) => [text, images.map(hold).join(' ')].filter(Boolean).join('\n\n');
  return [...(input?.clearQueue(restore) ?? []), ...queue.release().map(submission => restore(submission.text, submission.attachments?.images))];
}

/** The host's actual pending submissions, bound when the person queued them. */
export class SubmissionQueue {
  private readonly pending = new PendingQueue<PendingSubmission>();
  private deliveredAttachments?: PendingSubmission['attachments'];
  private deliveredSource?: PendingSubmission['source'];
  readonly control: InputQueueControl;

  constructor(private readonly current: () => Session, private readonly refused: (text: string, attachments?: PendingSubmission['attachments']) => void) {
    this.control = inputQueueControl([{ lane: 'pending', queue: this.pending, text: value => value.text,
      replace: (value, text) => ({ ...value, text }) }]);
  }
  get length(): number { return this.pending.entries().length; }

  push(text: string, attachments?: PendingSubmission['attachments'], source?: PendingSubmission['source']): string {
    const session = this.current();
    return this.pending.enqueue({ text, sessionId: session.id, createdAt: session.createdAt, projectRoot: session.projectRoot,
      ...(attachments ? { attachments } : {}), ...(source ? {source} : {}) });
  }

  shift(): string | undefined {
    this.deliveredAttachments = undefined;
    this.deliveredSource = undefined;
    while (this.pending.hasItems()) {
      const submission = this.pending.drain()[0]!;
      const session = this.current();
      if (session.id !== submission.sessionId || session.createdAt !== submission.createdAt || session.projectRoot !== submission.projectRoot) {
        if (submission.attachments) this.refused(submission.text, submission.attachments);
        else this.refused(submission.text);
        continue;
      }
      this.deliveredAttachments = submission.attachments;
      this.deliveredSource = submission.source;
      return submission.text;
    }
    return undefined;
  }

  takeAttachments(): PendingSubmission['attachments'] {
    const attachments = this.deliveredAttachments; this.deliveredAttachments = undefined; return attachments;
  }

  takeSource(): PendingSubmission['source'] {
    const source = this.deliveredSource; this.deliveredSource = undefined; return source;
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
