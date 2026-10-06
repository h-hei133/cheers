import { readRuntimeConfigEditAt } from "./runtimeConfig.js";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, readUserRuntimeConfigFile, writeUserRuntimeConfigFile } from './runtimeConfig.js';
import { patchConfigDocument } from './patch.js';

describe('configuration source syntax', () => {
  let root: string;
  let file: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'config-syntax-'));
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
    file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it('accepts comments/trailing commas without rewriting string contents', () => {
    fs.writeFileSync(file, '{/* header */ "theme": "x,}//literal/*text*/", "maxTurns": 21, }');
    expect(getRuntimeConfig(root).theme).toBe('x,}//literal/*text*/');
    expect(getRuntimeConfig(root).maxTurns).toBe(21);
    expect(readUserRuntimeConfigFile().theme).toBe('x,}//literal/*text*/');
  });

  it.each([
    '{"maxTurns": 1/*x*/2}', '{"theme": "literal\nnewline"}', '{/* unfinished',
    '{"maxTurns":2,"maxTurns":3}', '{"unknown":{"name":1,"na\\u006de":2}}',
    '{"unknown":1e400}', '{"__proto__":{}}',
  ])('rejects damaged or ambiguous documents without overwriting them: %s', content => {
    fs.writeFileSync(file, content);
    expect(getRuntimeConfig(root).allowedTools).toEqual([]);
    expect(() => writeUserRuntimeConfigFile({ maxTurns: 4 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });

  it('reports controlled positions after BOM and CRLF without revealing the source', () => {
    fs.writeFileSync(file, '\uFEFF{\r\n  "private-marker": @\r\n}');
    const message = getRuntimeConfig(root).configDiagnostics.join(' ');
    expect(message).toContain('line 2, column 21');
    expect(message).not.toContain('private-marker');
    expect(message).not.toContain('@');
  });

  it('stops deeply nested input with a controlled limit before parser stack overflow', () => {
    fs.writeFileSync(file, '{"unknown":' + '['.repeat(10000) + '0' + ']'.repeat(10000) + '}');
    const config = getRuntimeConfig(root);
    expect(config.allowedTools).toEqual([]);
    expect(config.configDiagnostics.join(' ')).toContain('resource-limit');
    expect(config.configDiagnostics.join(' ')).not.toContain('stack');
  });

  it('changes only the requested scalar while preserving comments, BOM, CRLF and placeholders', () => {
    const before = '\uFEFF{\r\n  // preferences\r\n  "theme" : "dark", /* sibling */ "unknown": { "keep": 1e2 },\r\n  "providerCredentials": { "openai": { "apiKey": "${MISSING_SYNTAX_SECRET}" } },\r\n}\r\n';
    fs.writeFileSync(file, before);
    writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(before.replace('"dark"', '"light"'));
    expect(readUserRuntimeConfigFile().providerCredentials?.openai?.apiKey).toBe('${MISSING_SYNTAX_SECRET}');
  });

  it('preserves untouched nested and array-entry comments during a connection edit', () => {
    const before = '{"providerConnections":[/* first */{"id":"a","provider":"openai","label":"old"},/* second */{"id":"b","provider":"openai"}],"tui":{"diagrams":"off",/* status */"statusItems":["model"]}}';
    fs.writeFileSync(file, before);
    const config = readUserRuntimeConfigFile();
    writeUserRuntimeConfigFile({ ...config, providerConnections: config.providerConnections!.map(connection => connection.id === 'a' ? { ...connection, label: 'new' } : connection) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(before.replace('"old"', '"new"'));
  });

  it('preserves no-op bytes and mtime', () => {
    const before = '{ "theme":"dark", "unknown": 1e2 }\n';
    fs.writeFileSync(file, before); fs.utimesSync(file, new Date(0), new Date(0));
    const mtime = fs.statSync(file).mtimeMs;
    writeUserRuntimeConfigFile(readUserRuntimeConfigFile(), readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
  });

  it('saves inserted and deleted fields as valid JSONC, preserving unaffected fields', () => {
    fs.writeFileSync(file, '{/* header */"theme":"dark",/* retained */"unknown":7,}');
    writeUserRuntimeConfigFile({ maxTurns: 22 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile()).toMatchObject({ theme: 'dark', maxTurns: 22 });
    expect(fs.readFileSync(file, 'utf8')).toContain('/* retained */');
    writeUserRuntimeConfigFile({ theme: undefined }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile().theme).toBeUndefined();
    expect(readUserRuntimeConfigFile().maxTurns).toBe(22);
  });

  it.each(['', '// only a comment', '/* comment */'])('keeps an empty present document distinct from absence: %s', content => {
    fs.writeFileSync(file, content);
    expect(getRuntimeConfig(root).allowedTools).toEqual([]);
    expect(() => writeUserRuntimeConfigFile({ maxTurns: 10 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe(content);
  });

  it('rejects invalid UTF-8 without replacing original bytes', () => {
    const before = Buffer.concat([Buffer.from('{"unknown":"'), Buffer.from([0xff]), Buffer.from('"}')]);
    fs.writeFileSync(file, before);
    expect(getRuntimeConfig(root).configDiagnostics.join(' ')).toContain('invalid-utf8');
    expect(() => writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
  });

  it('bounds nodes before constructing the parsed value', () => {
    fs.writeFileSync(file, '{"unknown":[' + Array(50000).fill('0').join(',') + ']}');
    expect(getRuntimeConfig(root).configDiagnostics.join(' ')).toContain('resource-limit');
  });

  it('removes nested keys and supports explicit empty object replacement', () => {
    fs.writeFileSync(file, '{"tui":{"diagrams":"off", "statusItems":["model"]},"theme":"dark"}');
    writeUserRuntimeConfigFile({ tui: {} }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile()).toEqual({ tui: {}, theme: 'dark' });
  });

  it('replaces changed array identities without retaining misleading comments', () => {
    const before = '{"providerConnections":[{"id":"a",/* belongs to a */"provider":"openai"},{"id":"b","provider":"openai"}]}';
    fs.writeFileSync(file, before);
    const connections = readUserRuntimeConfigFile().providerConnections!;
    writeUserRuntimeConfigFile({ providerConnections: [...connections].reverse() }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile().providerConnections?.map(connection => connection.id)).toEqual(['b', 'a']);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('belongs to a');
  });

  it('rejects patches exceeding operation or cumulative parse work without partial writes', () => {
    const unknown = Object.fromEntries(Array.from({ length: 129 }, (_, index) => ['key' + index, 0]));
    const next = Object.fromEntries(Object.keys(unknown).map(key => [key, 1]));
    fs.writeFileSync(file, JSON.stringify({ unknown }));
    const before = fs.readFileSync(file);
    expect(() => writeUserRuntimeConfigFile({ unknown: next } as never, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow(/resource-limit/);
    expect(fs.readFileSync(file)).toEqual(before);
    const large = { padding: 'x'.repeat(900000), unknown };
    fs.writeFileSync(file, JSON.stringify(large));
    const largeBefore = fs.readFileSync(file);
    const ten = { ...unknown, ...Object.fromEntries(Object.keys(unknown).slice(0, 10).map(key => [key, 1])) };
    expect(() => writeUserRuntimeConfigFile({ unknown: ten } as never, readRuntimeConfigEditAt(getUserRuntimeConfigPath()))).toThrow(/resource-limit/);
    expect(fs.readFileSync(file)).toEqual(largeBefore);
  });

  it('rejects a syntactically valid patch whose source disagrees with its snapshot', () => {
    expect(() => patchConfigDocument({ text: '{"theme":"light"}', values: { theme: 'dark' } }, { theme: 'dark' })).toThrow(/edit-mismatch/);
  });

  it('preserves negative zero tokens during no-op and unrelated field saves', () => {
    const before = '{"unknown":-0,"theme":"dark"}';
    fs.writeFileSync(file, before); fs.utimesSync(file, new Date(0), new Date(0));
    const mtime = fs.statSync(file).mtimeMs;
    writeUserRuntimeConfigFile(readUserRuntimeConfigFile(), readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    writeUserRuntimeConfigFile({ theme: 'light' }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(before.replace('"dark"', '"light"'));
  });

  it.each([
    ['{/* header */"theme":"dark",/* retained */"unknown":7,}', '{/* header *//* retained */"unknown":7,}'],
    ['{/* header */"unknown":7,/* theme */"theme":"dark"/* tail */}', '{/* header */"unknown":7/* theme *//* tail */}'],
    ['{/* header */"theme":"dark",/* tail */}', '{/* header *//* tail */}'],
  ])('deletes a property/separator while retaining surrounding comments', (before, after) => {
    fs.writeFileSync(file, before);
    writeUserRuntimeConfigFile({ theme: undefined }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).toBe(after);
    expect(getRuntimeConfig(root).allowedTools).toBeUndefined();
  });

  it('does not associate reordered identity-less records with old comments', () => {
    fs.writeFileSync(file, '{"denyRules":[{/* bash only */"tool":"bash"},{"tool":"write"}]}');
    writeUserRuntimeConfigFile({ denyRules: [{ tool: 'write' }, { tool: 'bash' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(readUserRuntimeConfigFile().denyRules).toEqual([{ tool: 'write' }, { tool: 'bash' }]);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('bash only');
  });

  it('does not carry ID comments across primitive slots in mixed arrays', () => {
    fs.writeFileSync(file, '{"unknown":[{/* identity a */"id":"a"},1]}');
    writeUserRuntimeConfigFile({ unknown: [1, { id: 'a' }] } as never, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    expect(fs.readFileSync(file, 'utf8')).not.toContain('identity a');
  });
});
