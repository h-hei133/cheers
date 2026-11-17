import { expect, it } from 'vitest';
import type { ToolDefinition } from '../../../tools/types.js';
import { rankToolsByBm25, tokenizeSearchText } from './ranker.js';

function tool(name: string, argsSchema: Record<string, unknown>, description = 'Record utility.'): ToolDefinition {
  return { name, description, argsSchema, execute: async () => ({ success: true }) };
}

it('finds schema-only terms through recursive local references without indexing unreachable definitions', () => {
  const recursive = tool('record_tree', {
    type: 'object',
    $defs: {
      Node: { type: 'object', properties: {
        value: { type: 'string', description: 'saffron' },
        children: { type: 'array', items: { $ref: '#/$defs/Node' } },
      } },
      Unused: { type: 'string', description: 'unreachablecobalt' },
    },
    properties: { root: { $ref: '#/$defs/Node' } },
  });
  expect(rankToolsByBm25('saffron', [recursive], 8).map(match => match.name)).toEqual(['record_tree']);
  expect(rankToolsByBm25('unreachablecobalt', [recursive], 8)).toEqual([]);
});

it('decodes escaped local pointers and indexes a shared referenced definition only once', () => {
  const definition = { type: 'string', description: 'heliotrope' };
  const single = tool('a_single', { type: 'object', $defs: { 'a/b~c': definition },
    properties: { first: { $ref: '#/$defs/a~1b~0c' } } });
  const shared = tool('z_shared', { type: 'object', $defs: { 'a/b~c': definition },
    properties: { first: { $ref: '#/$defs/a~1b~0c' }, second: { $ref: '#/$defs/a~1b~0c' } } });

  // Repeating a reference must not give the longer schema extra term-frequency credit.
  expect(rankToolsByBm25('heliotrope', [shared, single], 8).map(match => match.name)).toEqual(['a_single', 'z_shared']);
});

it.each(['anyOf', 'oneOf', 'allOf'])('finds descriptions in %s variants and array items', variant => {
  const nested = tool('nested_record', { type: 'object', properties: {
    entries: { type: 'array', items: { [variant]: [
      { type: 'object', properties: { trackingNumber: { type: 'string', description: 'saturnine' } } },
      { type: 'null' },
    ] } },
  } });
  expect(rankToolsByBm25('saturnine tracking number', [nested], 8).map(match => match.name)).toEqual(['nested_record']);
});

it('does not index remote reference text or a local definition reached only through a remote reference', () => {
  const remote = tool('remote_record', {
    type: 'object',
    $defs: { Remote: { type: 'string', description: 'remoteperidot' } },
    properties: { record: { $ref: 'https://fixture.invalid/remoteperidot#/$defs/Remote' } },
  });
  expect(rankToolsByBm25('remoteperidot', [remote], 8)).toEqual([]);
});

it('normalizes identifiers, English plurals and composed Unicode when ranking', () => {
  expect(tokenizeSearchText('XMLParser repositoryOwner issues searches boxes categories and the'))
    .toEqual(['xml', 'parser', 'repository', 'owner', 'issue', 'search', 'box', 'category']);
  const accented = tool('accented_record', {}, 'Inspect café records.');
  const chinese = tool('configured_record', {}, '读取配置');
  expect(rankToolsByBm25('cafe\u0301', [accented, chinese], 8).map(match => match.name)).toEqual(['accented_record']);
  expect(rankToolsByBm25('配置', [accented, chinese], 8).map(match => match.name)).toEqual(['configured_record']);
});

it('prioritizes an exact normalized MCP local name over description repetition', () => {
  const exact = tool('mcp__app__thread_read', {}, 'Read a conversation.');
  const noisy = tool('mcp__app__thread_read_export', {}, 'thread read '.repeat(100));
  expect(rankToolsByBm25('thread-read', [noisy, exact], 8).map(match => match.name)[0]).toBe(exact.name);
});

it('prioritizes term coverage over a repeated one-word match', () => {
  const complete = tool('inspect_display', {}, `Capture screenshot window. ${'irrelevant '.repeat(200)}`);
  const repetitive = tool('screenshot', {}, 'screenshot '.repeat(100));
  expect(rankToolsByBm25('screenshot window', [repetitive, complete], 8).map(match => match.name)[0]).toBe(complete.name);
});

it('keeps equal-score ordering deterministic across catalogue order and respects the result limit', () => {
  const first = tool('a_record', {}, 'Inspect amethyst.');
  const last = tool('z_record', {}, 'Inspect amethyst.');
  expect(rankToolsByBm25('amethyst', [last, first], 8).map(match => match.name)).toEqual(['a_record', 'z_record']);
  expect(rankToolsByBm25('amethyst', [first, last], 1).map(match => match.name)).toEqual(['a_record']);
});
