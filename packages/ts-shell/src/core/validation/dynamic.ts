import type { Keyword, SchemaNode, ValidationPath } from 'json-schema-library';
import type { SchemaEntry } from './admission.js';

/** Keep adjacent constraints active under the previous runtime's validation policy. */
export function separateReferences(entries: readonly SchemaEntry[]): void {
  for (const { schema, dialect } of entries) {
    if (typeof schema === 'boolean' || typeof schema.$ref !== 'string'
      || dialect !== 'draft-07' && typeof schema.$dynamicRef !== 'string' && typeof schema.$recursiveRef !== 'string') continue;
    const allOf = Array.isArray(schema.allOf) ? schema.allOf : [];
    schema.allOf = [...allOf, { $ref: schema.$ref }];
    delete schema.$ref;
  }
}

function referenced(node: SchemaNode, reference: string): SchemaNode | undefined {
  return node.context.refs[reference] ?? node.context.anchors[reference]
    ?? node.context.dynamicAnchors[reference] ?? node.context.remotes[reference];
}

function dynamicTarget(node: SchemaNode, reference: string, path: ValidationPath): SchemaNode | undefined {
  const initial = referenced(node, reference);
  if (!initial) return;
  const fragment = reference.split('#')[1];
  const name = fragment === undefined ? undefined : decodeURIComponent(fragment);
  // Plain pointers and static anchors retain their initial target.
  if (!name || name.startsWith('/') || typeof initial.schema !== 'object' || initial.schema.$dynamicAnchor !== name) return initial;
  for (const entry of path) {
    const resource = entry.node.$id?.split('#')[0];
    const candidate = resource && node.context.dynamicAnchors[resource + '#' + name];
    if (candidate) return candidate;
  }
  return initial;
}

/** Keep dynamic lookup tied to the initial named anchor and the entered resource scope. */
function referencePolicy(keyword: Keyword, active: ValidationPath): Keyword {
  if (keyword.keyword !== '$ref' || !keyword.parse) return keyword;
  const parse = keyword.parse;
  return { ...keyword, parse: node => {
    const result = parse(node);
    const original = node.resolveRef;
    node.resolveRef = function (options = {}) {
      if (typeof this.schema.$recursiveRef === 'string') return original.call(this, { ...options, path: [...active] });
      const reference = this.schema.$dynamicRef;
      if (typeof reference !== 'string') return original.call(this, options);
      const target = dynamicTarget(this, reference, active);
      if (!target) return original.call({ ...this,
        schema: { ...this.schema, $dynamicRef: undefined }, $ref: reference }, options);
      options.path?.push({ pointer: options.pointer ?? '#', node: target });
      return target;
    };
    return result;
  } };
}

/** Track active evaluation calls independently of the interpreter's visit history. */
export function scopeKeywords(policy: (keyword: Keyword) => Keyword): (keyword: Keyword) => Keyword {
  const active: ValidationPath = [];
  function wrap<T extends ValidationPath[number], R>(
    callback: ((options: T) => R) & { toJSON?: () => string; order?: number }, keyword: Keyword,
  ): typeof callback {
    return Object.assign((options: T) => {
      active.push({ node: options.node, pointer: options.pointer });
      try { return callback(options); } finally { active.pop(); }
    }, { toJSON: callback.toJSON ?? (() => keyword.keyword), order: callback.order ?? keyword.order });
  }
  return keyword => {
    const scoped = referencePolicy(policy(keyword), active);
    const { validate, reduce, parse } = scoped;
    if (validate) scoped.validate = wrap(validate, scoped);
    if (reduce) scoped.reduce = wrap(reduce, scoped);
    // Some keywords register per-node callbacks during parse rather than on the draft.
    if (parse) scoped.parse = node => {
      const validators = node.validators.length;
      const reducers = node.reducers.length;
      const result = parse(node);
      for (let i = validators; i < node.validators.length; i++) node.validators[i] = wrap(node.validators[i]!, scoped);
      for (let i = reducers; i < node.reducers.length; i++) node.reducers[i] = wrap(node.reducers[i]!, scoped);
      return result;
    };
    return scoped;
  };
}
