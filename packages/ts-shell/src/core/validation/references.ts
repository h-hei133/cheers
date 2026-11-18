import fastUri from 'fast-uri';
import type { SchemaNode } from 'json-schema-library';
import { admitTarget, schemaPointer, type SchemaEntry } from './admission.js';
import { isSchema } from './capture.js';
import { invalidSchema, type CompileOptions, type Schema } from './contract.js';
import { officialSchema } from './dialects.js';

const retrievalId = 'https://schema.invalid/root';
const referenceKeywords = ['$ref', '$dynamicRef', '$recursiveRef'] as const;
const { normalize, parse, resolve } = fastUri;

interface Resource {
  readonly id: string;
  readonly entry: SchemaEntry;
}

interface Scope {
  readonly id: string;
  readonly resource: Resource;
}

export interface ReferenceIndex {
  readonly targets: ReadonlyMap<string, SchemaEntry>;
  readonly entries: readonly SchemaEntry[];
  readonly scopes: ReadonlyMap<SchemaEntry, Scope>;
}

interface IndexState {
  readonly targets: Map<string, SchemaEntry>;
  readonly resources: Map<string, Resource>;
  readonly positions: Map<string, SchemaEntry>;
  readonly scopes: Map<SchemaEntry, Scope>;
}

function uri(base: string, reference: string): string {
  const resolved = normalize(resolve(base, reference));
  if (parse(resolved).error) return invalidSchema();
  return resolved.replace(/#$/, '');
}

function unique(targets: Map<string, SchemaEntry>, id: string, entry: SchemaEntry): void {
  const previous = targets.get(id);
  if (previous && previous !== entry) return invalidSchema();
  targets.set(id, entry);
}

function fragmentPointer(fragment: string): string {
  const decoded = decodeURIComponent(fragment);
  if (decoded !== '' && decoded[0] !== '/') return invalidSchema();
  if (/~(?:[^01]|$)/.test(decoded)) return invalidSchema();
  let pointer = '';
  for (const part of decoded.split('/').slice(1)) pointer = schemaPointer(pointer, part.replace(/~1/g, '/').replace(/~0/g, '~'));
  return pointer;
}

function pointerValue(schema: Schema, pointer: string): unknown {
  let current: unknown = schema;
  for (const token of pointer.split('/').slice(1)) {
    const name = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, name)) return invalidSchema();
    current = (current as Record<string, unknown>)[name];
  }
  return current;
}

function resourceEntries(entries: SchemaEntry[], state: IndexState): void {
  for (const entry of entries) {
    if (state.scopes.has(entry)) continue;
    const parent = entry.parent ? state.scopes.get(entry.parent) : undefined;
    const schema = entry.schema;
    // Draft 7 $ref suppresses the sibling $id and inherits the enclosing scope.
    const authoredId = typeof schema === 'boolean'
      || entry.dialect === 'draft-07' && Object.hasOwn(schema, '$ref')
      ? undefined : schema.$id;
    if (authoredId !== undefined && typeof authoredId !== 'string') return invalidSchema();
    const id = authoredId === undefined ? parent?.id ?? retrievalId : uri(parent?.id ?? retrievalId, authoredId as string);
    let resource = parent?.resource;
    if (!resource || authoredId !== undefined) {
      const separator = id.indexOf('#');
      const resourceId = separator < 0 ? id : id.slice(0, separator);
      const fragment = separator < 0 ? '' : id.slice(separator + 1);
      if (fragment && entry.dialect !== 'draft-07') return invalidSchema();
      if (!fragment) {
        if (state.resources.has(resourceId)) return invalidSchema();
        resource = { id: resourceId, entry };
        state.resources.set(resourceId, resource);
      } else {
        resource = state.resources.get(resourceId) ?? resource;
        if (!resource && !entry.parent) {
          resource = { id: resourceId, entry };
          state.resources.set(resourceId, resource);
        }
      }
      if (!resource) return invalidSchema();
      unique(state.targets, id, entry);
    }
    state.scopes.set(entry, { id, resource });
    state.positions.set(entry.pointer, entry);
    if (typeof schema === 'boolean') continue;
    for (const keyword of ['$anchor', '$dynamicAnchor']) {
      if (!Object.hasOwn(schema, keyword)) continue;
      if (typeof schema[keyword] !== 'string') return invalidSchema();
      unique(state.targets, resource.id + '#' + schema[keyword], entry);
    }
  }
}

function referenceTarget(reference: string, state: IndexState, entries: SchemaEntry[], options: CompileOptions): SchemaEntry | undefined {
  const direct = state.targets.get(reference);
  if (direct) return direct;
  const separator = reference.indexOf('#');
  const resourceId = separator < 0 ? reference : reference.slice(0, separator);
  const resource = state.resources.get(resourceId);
  const fragment = separator < 0 ? '' : reference.slice(separator + 1);
  if (!resource) {
    const schema = officialSchema(resourceId);
    if (schema === undefined) return invalidSchema();
    if (fragment) {
      if (decodeURIComponent(fragment).startsWith('/')) {
        if (!isSchema(pointerValue(schema, fragmentPointer(fragment)))) return invalidSchema();
      } else if (schema !== false && schema !== true && fragment !== schema.$dynamicAnchor && fragment !== schema.$anchor) {
        return invalidSchema();
      }
    }
    // Shipped official schemas are installed separately under their original IDs.
    return undefined;
  }
  if (!fragment) return resource.entry;
  const localPointer = fragmentPointer(fragment);
  const pointer = resource.entry.pointer + localPointer;
  const admitted = state.positions.get(pointer);
  if (admitted) return admitted;
  const targetSchema = pointerValue(resource.entry.schema, localPointer);
  let parent = resource.entry;
  for (const candidate of state.positions.values()) {
    if (pointer.startsWith(candidate.pointer + '/') && candidate.pointer.length > parent.pointer.length) parent = candidate;
  }
  // Only a reached target becomes a schema: ordinary annotation data stays inert.
  const target = admitTarget(targetSchema, pointer, parent, options, entries, state.positions);
  resourceEntries(entries, state);
  return target;
}

/** Index only resources contained in this captured schema; there is no loader. */
export function indexReferences(entries: SchemaEntry[], options: CompileOptions): ReferenceIndex {
  const targets = new Map<string, SchemaEntry>();
  const resources = new Map<string, Resource>();
  const pointers = new Map<string, SchemaEntry>();
  const scopes = new Map<SchemaEntry, Scope>();
  const state: IndexState = { targets, resources, positions: pointers, scopes };
  resourceEntries(entries, state);
  // Give the private compiler copy absolute resource IDs, keeping caller bytes intact.
  for (const entry of entries) {
    if (typeof entry.schema === 'boolean') continue;
    const scope = scopes.get(entry)!;
    if (!entry.parent || Object.hasOwn(entry.schema, '$id')) entry.schema.$id = scope.id;
    for (const keyword of referenceKeywords) {
      if (!Object.hasOwn(entry.schema, keyword)) continue;
      const reference = entry.schema[keyword];
      if (typeof reference !== 'string') return invalidSchema();
      const absolute = uri(scope.id, reference);
      const target = referenceTarget(absolute, state, entries, options);
      if (target) unique(targets, absolute, target);
      entry.schema[keyword] = absolute;
    }
  }
  return { entries, scopes, targets };
}

function encodedPointer(pointer: string): string {
  return pointer.split('/').map((part, index) => index === 0 ? '' : encodeURIComponent(part)).join('/');
}

/** Install exact aliases for the admitted schema positions in the isolated context. */
export function bindReferences(root: SchemaNode, index: ReferenceIndex): void {
  const compiled = new Map<SchemaEntry, SchemaNode>();
  const rootId = index.scopes.get(index.entries[0])!.id.split('#')[0];
  for (const entry of index.entries) {
    const scope = index.scopes.get(entry)!;
    const pointer = encodedPointer(entry.pointer);
    let node = root.context.refs[rootId + (pointer ? '#' + pointer : '')];
    if (!node || node.schema !== entry.schema) {
      node = entry.parent ? compiled.get(entry.parent)!.compileSchema(entry.schema, '#' + pointer, '#' + pointer) : root;
    }
    if (!isSchema(node.schema)) return invalidSchema();
    compiled.set(entry, node);
    const localPointer = encodedPointer(entry.pointer.slice(scope.resource.entry.pointer.length));
    root.context.refs[scope.resource.id + (localPointer ? '#' + localPointer : '')] = node;
    root.context.refs[rootId + (pointer ? '#' + pointer : '')] = node;
    if (scope.resource.entry === entry) root.context.remotes[scope.resource.id] = node;
  }
  for (const [id, entry] of index.targets) {
    const node = compiled.get(entry)!;
    root.context.refs[id] = node;
    const schema: Schema = entry.schema;
    if (typeof schema === 'boolean') continue;
    const scope = index.scopes.get(entry)!;
    if (typeof schema.$anchor === 'string' && id === scope.resource.id + '#' + schema.$anchor) root.context.anchors[id] = node;
    if (typeof schema.$dynamicAnchor === 'string' && id === scope.resource.id + '#' + schema.$dynamicAnchor) root.context.dynamicAnchors[id] = node;
  }
}
