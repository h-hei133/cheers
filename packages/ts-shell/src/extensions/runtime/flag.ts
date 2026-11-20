import { types } from 'node:util';

export interface ExtensionFlag {
  readonly name: string;
  readonly description?: string;
  readonly type?: 'string' | 'boolean';
  readonly default?: string | boolean;
}

export interface WorkerFlag {
  readonly definition: ExtensionFlag;
  readonly value?: boolean | string;
}

export const EXTENSION_FLAG_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function createFlagCapture(isProxy: (value: unknown) => boolean, namePattern: RegExp) {
  const descriptor = Object.getOwnPropertyDescriptor;
  const freeze = Object.freeze;
  function field(input: object, name: keyof ExtensionFlag): unknown {
    const property = descriptor(input, name);
    if (property && !('value' in property)) throw new Error('Invalid extension flag declaration.');
    return property?.value;
  }
  return function captureFlag(input: unknown): ExtensionFlag {
    if (!input || typeof input !== 'object' || isProxy(input)) throw new Error('Invalid extension flag declaration.');
    const name = field(input, 'name');
    const description = field(input, 'description');
    const declaredType = field(input, 'type');
    const type = declaredType === undefined ? 'string' : declaredType;
    const fallback = field(input, 'default');
    if (typeof name !== 'string' || !namePattern.test(name)
      || (type !== 'string' && type !== 'boolean')
      || (description !== undefined && (typeof description !== 'string' || description.length > 512))
      || (fallback !== undefined && (typeof fallback !== type || typeof fallback === 'string' && fallback.length > 4096))) {
      throw new Error('Invalid extension flag declaration.');
    }
    return freeze({ name, type, ...(description === undefined ? {} : { description }),
      ...(fallback === undefined ? {} : { default: fallback as string | boolean }) });
  };
}

export const captureFlag = createFlagCapture(types.isProxy, EXTENSION_FLAG_NAME);
