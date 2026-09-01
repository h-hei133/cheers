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
  private pending: { readonly question: string; readonly resolve: (answer: string) => void } | undefined;
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
    pending.resolve(text);
    this.handlers.settle();
    return true;
  }

  /** Resolve any pending question as declined, for shutdown or interruption. */
  abandon(): void {
    this.answer("n");
  }

  /**
   * A readline-shaped object carrying only what runtime callers use. Anything
   * that would take over the terminal is intentionally inert.
   */
  asReadline(onClose: () => void): ReadlineInterface {
    const bridge = this;
    return {
      question(query: string, callback: (answer: string) => void): void {
        const text = query.trim();
        bridge.pending = { question: text, resolve: callback };
        bridge.handlers.ask(text);
      },
      close: onClose,
      prompt: () => {},
      setPrompt: () => {},
      pause: () => {},
      resume: () => {},
      on: () => undefined,
      off: () => undefined,
      once: () => undefined,
      removeListener: () => undefined,
      write: () => {},
    } as unknown as ReadlineInterface;
  }
}
