/** Plain, versioned command output. Presentation alone assigns terminal styles. */
export const REPORT_BYTES = 1024 * 1024;
export const REPORT_NODES = 20_000;
export const REPORT_DEPTH = 32;
export const REPORT_LINES = 20_000;

export const REPORT_ROLES = ['text', 'command', 'argument', 'flag', 'key', 'path',
  'number', 'unit', 'muted', 'emphasis', 'subtle', 'heading', 'code', 'warning', 'error', 'success',
  'context-normal', 'context-elevated', 'context-high', 'context-critical'] as const;
export type ReportRole = typeof REPORT_ROLES[number];

export interface ReportSpan {
  readonly text: string;
  readonly role: ReportRole;
}

export type ReportLine =
  | { readonly kind: 'text'; readonly spans: readonly ReportSpan[]; readonly bullet?: boolean }
  | { readonly kind: 'heading'; readonly spans: readonly ReportSpan[] }
  | { readonly kind: 'columns'; readonly cells: readonly (readonly ReportSpan[])[] }
  | { readonly kind: 'space' };

export interface ReportColumn {
  readonly label: string;
  readonly align?: 'left' | 'right';
  /** Minimum useful cell width before a table stacks its labelled fields. */
  readonly minWidth: number;
}

export type ReportValue = string | number | boolean | null | readonly ReportValue[]
  | { readonly [key: string]: ReportValue };

export interface CommandReport {
  readonly version: 1;
  readonly title: string;
  readonly columns?: readonly ReportColumn[];
  readonly lines: readonly ReportLine[];
  /** Stable facts and provenance, independent of locale and visual layout. */
  readonly facts: Readonly<Record<string, ReportValue>>;
}
