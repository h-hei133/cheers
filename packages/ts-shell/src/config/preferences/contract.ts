import type { AnySchemaObject } from 'ajv';
import { enumSchema, listSchema, nameSchema, objectSchema, textSchema } from '../schema.js';

export const PREFERENCE_FIELD = 'modelPreferences';
export const PREFERENCE_KEYS = ['model', 'thinkingEffort', 'serviceTier'] as const;

export interface Preference {
  readonly model?: string;
  readonly thinkingEffort?: 'low' | 'medium' | 'high' | null;
  readonly serviceTier?: string;
}

export interface ConnectionPreference extends Preference {
  readonly id: string;
  readonly provider: string;
}

export interface ModelPreferences {
  readonly providers?: Readonly<Record<string, Preference>>;
  readonly connections?: readonly ConnectionPreference[];
}

/** Preference failures never report supplied identities or field values. */
export class PreferenceDocumentError extends Error {
  constructor() { super('Model preference document has invalid or ambiguous ownership.'); }
}

/** Only model controls belong here; credential and transport declarations do not. */
export function createPreferenceSchema(providers: readonly string[]): AnySchemaObject {
  const fields = { model: { ...textSchema, environment: true }, serviceTier: nameSchema,
    thinkingEffort: { enum: ['low', 'medium', 'high', null] } };
  return objectSchema({ providers: objectSchema(Object.fromEntries(providers.map(provider => [provider, objectSchema(fields)]))),
    connections: listSchema(objectSchema({ ...fields, id: nameSchema, provider: enumSchema(providers) }, ['id', 'provider'])) });
}
