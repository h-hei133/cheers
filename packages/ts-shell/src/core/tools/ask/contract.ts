export interface AskOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  id: string;
  question: string;
  options?: AskOption[];
  recommended?: number;
}

/** Only submitted answers belong in this record; recommendations are UI hints. */
export type AskCancellationReason = 'parent-abort' | 'user-cancelled' | 'input-closed' | 'unknown';

export interface AskResponse {
  readonly status: 'completed' | 'cancelled' | 'unavailable' | 'error';
  readonly answers: Readonly<Record<string, string>>;
  /** Safe cause code; never forward an arbitrary AbortSignal.reason or exception. */
  readonly cancellationReason?: AskCancellationReason;
}

export type InteractiveAsk = (
  questions: readonly AskQuestion[],
  signal?: AbortSignal,
) => Promise<AskResponse>;
