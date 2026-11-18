import { compileSchema, draft07, draft2019, draft2020, type Draft, type Keyword, type SchemaNode } from 'json-schema-library';
import { remotes } from 'json-schema-library/remotes';
import { invalidSchema, type Dialect, type Schema } from './contract.js';
import { formatValidators } from './formats.js';

const bases: Readonly<Record<Dialect, Draft>> = {
  'draft-07': draft07,
  'draft-2019-09': draft2019,
  'draft-2020-12': draft2020,
};

const identifiers: Readonly<Record<Dialect, string>> = {
  'draft-07': 'http://json-schema.org/draft-07/schema',
  'draft-2019-09': 'https://json-schema.org/draft/2019-09/schema',
  'draft-2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

const metaValidators = new Map<Dialect, SchemaNode>();
let officialSources: ReadonlyMap<string, string> | undefined;

function schemaSources(): ReadonlyMap<string, string> {
  if (!officialSources) {
    const sources = new Map<string, string>();
    for (const remote of remotes) {
      if (typeof remote.$id !== 'string' || !/\/draft(?:-07|\/2019-09|\/2020-12)\//.test(remote.$id)) continue;
      // Private immutable bytes; registrations receive fresh mutable copies.
      sources.set(remote.$id.replace(/#$/, ''), JSON.stringify(remote));
    }
    officialSources = sources;
  }
  return officialSources;
}

export function officialSchema(id: string): Schema | undefined {
  const source = schemaSources().get(id.replace(/#$/, ''));
  return source === undefined ? undefined : JSON.parse(source) as Schema;
}

export function installOfficialSchemas(node: SchemaNode): void {
  for (const [id, source] of schemaSources()) node.addRemoteSchema(id, JSON.parse(source) as Schema);
}

export function dialectOf(schema: Schema, fallback: Dialect = 'draft-07'): Dialect {
  if (typeof schema === 'boolean' || !Object.hasOwn(schema, '$schema')) return fallback;
  const id = schema.$schema;
  if (typeof id !== 'string') return invalidSchema();
  const canonical = id.replace(/#$/, '');
  if (canonical === identifiers['draft-07']) return 'draft-07';
  if (canonical === identifiers['draft-2019-09']) return 'draft-2019-09';
  if (canonical === identifiers['draft-2020-12']) return 'draft-2020-12';
  return invalidSchema();
}

function customizedDraft(dialect: Dialect, policy?: (keyword: Keyword) => Keyword): Draft {
  const base = bases[dialect];
  const errors: Draft['errors'] = {};
  for (const code of Object.keys(base.errors)) errors[code] = 'Schema constraint failed.';
  return {
    ...base,
    $schemaRegEx: '^' + identifiers[dialect].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '#?$',
    formats: formatValidators(),
    errors,
    keywords: base.keywords.map(keyword => policy ? policy({ ...keyword }) : { ...keyword }),
  };
}

export function compilerDrafts(dialect: Dialect, policy?: (keyword: Keyword) => Keyword): Draft[] {
  // Unspecified nested resources inherit their parent's declared dialect.
  const drafts = (Object.keys(bases) as Dialect[]).filter(item => item !== dialect).map(item => customizedDraft(item, policy));
  drafts.push(customizedDraft(dialect, policy));
  return drafts;
}

/** Official grammar, compiled lazily with complete resource retrieval IDs. */
export function validateGrammar(schema: Schema, dialect: Dialect): void {
  let validator = metaValidators.get(dialect);
  if (!validator) {
    const id = identifiers[dialect];
    const root = officialSchema(id);
    if (!root) return invalidSchema();
    const drafts = compilerDrafts(dialect);
    const node = compileSchema(root, {
      drafts, formatAssertion: true, throwOnInvalidSchema: true, throwOnInvalidRef: true,
    });
    installOfficialSchemas(node);
    if (node.schemaErrors?.length) return invalidSchema();
    validator = node;
    metaValidators.set(dialect, validator);
  }
  const result = validator.validate(schema);
  if (!result.valid || result.errorsAsync.length) invalidSchema();
}
