/** A model preference contains no credential and applies only to its connection. */
export interface SessionModelSelection {
  readonly connectionId: string;
  readonly provider: string;
  readonly model: string;
}

