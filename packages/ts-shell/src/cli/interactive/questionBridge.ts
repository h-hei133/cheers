import { EventEmitter } from "node:events";
import type { Interface as ReadlineInterface } from "node:readline";

/**
 * Readline stand-in for a host that owns raw stdin.
 *
 * Runtime code asks the user questions through `readline.question`, which cannot
 * work while a full-screen host holds stdin in raw mode. This bridge answers
 * those calls from the host's own prompt instead: the question is published for
 * the host to display, and the next submitted line resolves it. That keeps the
 * approval flow real rather than defaulting to a silent denial.
 */

export interface QuestionHandlers {
  /** Publish a question that now needs an answer from the host's prompt. */
  ask(question: string): void;
  /** The pending question was answered or abandoned. */
  settle(): void;
}

export class QuestionBridge {
  private pending: { readonly question: string; readonly resolve: (answer: string) => void; readonly cleanup: () => void; readonly cancel?: () => void } | undefined;
  private readonly handlers: QuestionHandlers;

  constructor(handlers: QuestionHandlers) {
    this.handlers = handlers;
  }

  /** The question awaiting an answer, or undefined when none is pending. */
  question(): string | undefined {
    return this.pending?.question;
  }

  /**
   * Answer the pending question. Returns false when nothing was pending, so the
   * host can treat the submission as ordinary input.
   */
  answer(text: string): boolean {
    const pending = this.pending;
    if (!pending) return false;
    this.pending = undefined;
    pending.cleanup();
    pending.resolve(text);
    this.handlers.settle();
    return true;
  }

  /** Cancel signal-aware questions; legacy confirmation callers receive a refusal. */
  abandon(): void {
    if (this.pending?.cancel) this.pending.cancel();
    else this.answer("n");
  }

  /**
   * A readline-shaped object carrying only what runtime callers use. Anything
   * that would take over the terminal is intentionally inert.
   */
  asReadline(onClose: () => void): ReadlineInterface {
    const bridge = this;
    const events = new EventEmitter();
    return Object.assign(events, {
      question(query: string, options: { signal?: AbortSignal } | ((answer: string) => void), callback?: (answer: string) => void): void {
        if (bridge.pending) throw new Error('A question is already pending.');
        const signal = typeof options === 'function' ? undefined : options.signal;
        const resolve = typeof options === 'function' ? options : callback!;
        if (signal?.aborted) return;
        const text = query.trim();
        const cleanup = (): void => signal?.removeEventListener('abort', abort);
        const abort = (): void => {
          if (bridge.pending?.resolve !== resolve) return;
          bridge.pending = undefined;
          cleanup();
          bridge.handlers.settle();
        };
        bridge.pending = { question: text, resolve, cleanup,
          ...(signal ? { cancel: () => { events.emit('SIGINT'); abort(); } } : {}) };
        signal?.addEventListener('abort', abort, { once: true });
        try { bridge.handlers.ask(text); }
        catch (error) { abort(); throw error; }
      },
      close: () => { events.emit('close'); bridge.abandon(); onClose(); },
      prompt: () => {},
      setPrompt: () => {},
      pause: () => {},
      resume: () => {},
      write: () => {},
    }) as unknown as ReadlineInterface;
  }
}
