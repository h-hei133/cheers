import { types } from 'node:util';

export interface ExtensionFlag {
  readonly name: string;
  readonly description?: string;
  readonly type?: 'string' | 'boolean';
  readonly default?: string | boolean;
}

export const EXTENSION_FLAG_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function captureFlag(input: ExtensionFlag): ExtensionFlag {
  if (!input || typeof input !== 'object' || types.isProxy(input)) throw new Error('Invalid extension flag declaration.');
  const name = field(input, 'name');
  const description = field(input, 'description');
  const declaredType = field(input, 'type');
  const type = declaredType === undefined ? 'string' : declaredType;
  const fallback = field(input, 'default');
  if (typeof name !== 'string' || !EXTENSION_FLAG_NAME.test(name)
    || (type !== 'string' && type !== 'boolean')
    || (description !== undefined && (typeof description !== 'string' || description.length > 512))
    || (fallback !== undefined && typeof fallback !== type)) throw new Error('Invalid extension flag declaration.');
  return Object.freeze({ name, type, ...(description === undefined ? {} : { description }),
    ...(fallback === undefined ? {} : { default: fallback as string | boolean }) });
}

function field(input: ExtensionFlag, name: keyof ExtensionFlag): unknown {
  const property = Object.getOwnPropertyDescriptor(input, name);
  if (property && !('value' in property)) throw new Error('Invalid extension flag declaration.');
  return property?.value;
}
