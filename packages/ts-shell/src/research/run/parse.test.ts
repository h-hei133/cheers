import { expect, it } from 'vitest';
import { NetworkError } from '../../core/network/error.js';
import { parseResearchOutput } from './parse.js';

it.each(['{"answer":', 'password=synthetic-sensitive'])('reports malformed stage JSON as a fixed research error: %j', text => {
  expect(() => parseResearchOutput(text, { type: 'object' })).toThrow(new Error('Research stage output is not valid bounded JSON.'));
  expect(() => parseResearchOutput(text, { type: 'object' })).not.toThrow(NetworkError);
});

it('keeps the JSON depth bound and distinguishes it from transport failure', () => {
  const nested = '{"child":'.repeat(16) + '{}' + '}'.repeat(16);
  expect(() => JSON.parse(nested)).not.toThrow();
  expect(() => parseResearchOutput(nested, { type: 'object' })).toThrow('Research stage output is not valid bounded JSON.');
  expect(parseResearchOutput('{"child":'.repeat(15) + '{}' + '}'.repeat(15), { type: 'object' })).toBeDefined();
});

it('keeps the UTF-8 byte bound before parsing', () => {
  const text = JSON.stringify({ value: '界'.repeat(32000) });
  expect(text.length).toBeLessThan(96000);
  expect(() => parseResearchOutput(text, { type: 'object' })).toThrow('Research stage output exceeded its bound.');
});

it('accepts only an object matching the stage schema', () => {
  const schema = { type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: { type: 'string' } } };
  expect(parseResearchOutput(' \n{"answer":"retained"}\n ', schema)).toEqual({ answer: 'retained' });
  expect(() => parseResearchOutput('[]', schema)).toThrow('Research stage output must be a JSON object.');
  expect(() => parseResearchOutput('{"answer":1}', schema)).toThrow('Research stage output does not match its schema.');
});
