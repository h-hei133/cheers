import { isDeepStrictEqual } from 'node:util';
import type { RequestDeclaration } from './model.js';

export interface DeclarationMessage {
  readonly id?: string;
  readonly role: string;
  readonly content?: unknown;
  readonly requestDeclaration?: RequestDeclaration;
}

export function sameDeclarationTarget(left: RequestDeclaration['target'], right: RequestDeclaration['target']): boolean {
  return left.provider === right.provider && left.model === right.model
    && left.endpoint === right.endpoint && left.replayBinding === right.replayBinding;
}

/** A return to a target starts a new epoch instead of borrowing its old baseline. */
export function declarationEpoch<T extends DeclarationMessage>(messages: readonly T[], target: RequestDeclaration['target']): T[] {
  let previous: RequestDeclaration['target'] | undefined;
  const epoch: T[] = [];
  for (const message of messages) {
    const declaration = message.requestDeclaration;
    if (!declaration) continue;
    if (!previous || !sameDeclarationTarget(previous, declaration.target)) epoch.length = 0;
    if (sameDeclarationTarget(declaration.target, target)) epoch.push(message);
    previous = declaration.target;
  }
  return epoch;
}

/** Converters may change prose, but must retain the explicit declaration boundaries. */
export function assertDeclarationHistory(source: readonly DeclarationMessage[], converted: readonly DeclarationMessage[]): void {
  const expected = source.filter(message => message.requestDeclaration);
  const actual = converted.filter(message => message.requestDeclaration);
  if (expected.length !== actual.length || expected.some((message, index) => {
    const candidate = actual[index]!;
    return candidate.role !== 'system' || candidate.content !== '' || message.id !== candidate.id
      || !isDeepStrictEqual(message.requestDeclaration, candidate.requestDeclaration);
  })) throw new Error('Message conversion must preserve request declaration boundaries.');
  const ids = expected.map(message => message.id).filter(id => id !== undefined);
  if (new Set(ids).size !== ids.length) throw new Error('Request declaration identities must be unique.');
}
