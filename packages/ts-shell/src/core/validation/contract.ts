export interface ValidationError {
  readonly keyword: string;
}

export interface CompiledValidator<T = unknown> {
  (value: unknown): value is T;
  errors: readonly ValidationError[] | null;
}

export interface CompileOptions {
  readonly formats?: boolean;
  /** Owner-authorized schema annotations; these never grant data mutation. */
  readonly annotations?: readonly string[];
  readonly allowExtensionAnnotations?: boolean;
}

export type Schema = boolean | Record<string, unknown>;
export type Dialect = 'draft-07' | 'draft-2019-09' | 'draft-2020-12';

export function invalidSchema(): never {
  throw new Error('Validation schema is invalid or unsupported.');
}

export function constraintError(keyword: string): readonly ValidationError[] {
  return Object.freeze([Object.freeze({ keyword })]);
}
