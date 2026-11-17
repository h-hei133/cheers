import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolExecutionResult } from '../../../tools/types.js'
import { createDefaultExecutionService } from '../../../runtime/execution/service.js'
import { inspectImage } from '../../../model-adapters/image/input.js'
import { SessionManager } from '../../../session/SessionManager.js'
import type { McpToolDescriptor } from '../../mcp/types.js'
import { validateToolArguments } from '../arguments.js'
import { createCoreToolRegistry } from '../registry.js'
import { createReadToolDefinition } from '../read.js'
import { renderToolSample } from './declarations.js'
import { createCodemodeToolDefinition } from './tool.js'

const SESSION_ID = 'codemode-declarations'
const QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['query'],
  properties: { query: { type: 'string' } },
}

let temporary: string
let workspace: string

beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test')
  fs.mkdirSync(parent, { recursive: true })
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-declarations-'))
  workspace = path.join(temporary, 'workspace')
  const home = path.join(temporary, 'home')
  fs.mkdirSync(workspace)
  fs.mkdirSync(home)
  vi.stubEnv('HOME', home)
  vi.stubEnv('USERPROFILE', home)
  vi.stubEnv('CHEERS_TEST_ROOT', temporary)
  vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary)
  new SessionManager().createNewWithId(SESSION_ID, workspace)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(temporary, { recursive: true, force: true })
})

function fixtureTool(name: string, argsSchema: Record<string, unknown> = QUERY_SCHEMA): ToolDefinition {
  return {
    name,
    description: 'Look up an isolated fixture document by query.',
    argsSchema,
    execute: async args => ({ success: true, output: `${name}:${String(args.query)}` }),
  }
}

function fixtureRegistry(names: readonly string[]): ReadonlyMap<string, ToolDefinition> {
  const registry = new Map<string, ToolDefinition>(names.map(name => [name, fixtureTool(name)]))
  registry.set('codemode', createCodemodeToolDefinition(() => registry))
  return registry
}

async function runScript(registry: ReadonlyMap<string, ToolDefinition>, code: string): Promise<ToolExecutionResult> {
  const result = await registry.get('codemode')!.execute({ code }, {
    workspaceRoot: workspace,
    sessionId: SESSION_ID,
    taskId: 'declaration-consumer',
  })
  expect(result.success, result.error ?? result.output).toBe(true)
  return result
}

function scriptJson<T>(result: ToolExecutionResult): T {
  expect(result.output).toMatch(/^Script completed\s/)
  return JSON.parse(result.output!.replace(/^Script completed\s*/, '')) as T
}

function signatureExpression(sample: string): string {
  const match = /^tools(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^\n]+\])(?=\(args:)/m.exec(sample)
  expect(match, sample).not.toBeNull()
  return match![0]
}

function signatureArgumentType(sample: string): string {
  const start = sample.indexOf('(args: ')
  const end = sample.lastIndexOf('): Promise<')
  expect(start, sample).toBeGreaterThanOrEqual(0)
  expect(end, sample).toBeGreaterThan(start)
  return sample.slice(start + '(args: '.length, end)
}

describe('declarations consumed by the actual script worker', () => {
  it.each([
    { raw: 'fixture_lookup', alias: 'fixture_lookup' },
    { raw: 'docs:lookup', alias: 'docs_lookup' },
    { raw: 'class', alias: 'class_' },
    { raw: '9lookup', alias: '_9lookup' },
  ])('calls the emitted identifier for $raw and preserves raw lookup', async ({ raw, alias }) => {
    const registry = fixtureRegistry([raw])
    const descriptions = scriptJson<{ raw: string; alias: string | null }>(await runScript(registry, `
      return { raw: await describeTool(${JSON.stringify(raw)}), alias: await describeTool(${JSON.stringify(alias)}) };
    `))
    const expression = signatureExpression(descriptions.raw)
    const result = await runScript(registry, `
      return {
        advertised: await ${expression}({ query: 'advertised' }),
        raw: await tools[${JSON.stringify(raw)}]({ query: 'raw' }),
      };
    `)

    expect(scriptJson(result)).toEqual({ advertised: `${raw}:advertised`, raw: `${raw}:raw` })
    expect(expression).toBe(`tools.${alias}`)
    expect(descriptions.alias).toBe(descriptions.raw)
    expect(result.metadata?.nestedCalls).toMatchObject({
      complete: true,
      calls: [{ name: raw, status: 'ok' }, { name: raw, status: 'ok' }],
    })
  })

  it.each([
    { label: 'two normalized aliases', names: ['my-tool', 'my:tool'], alias: 'my_tool', rawOwner: null },
    { label: 'an alias matching another raw name', names: ['my-tool', 'my_tool'], alias: 'my_tool', rawOwner: 'my_tool' },
    { label: 'a keyword alias matching another raw name', names: ['class', 'class_'], alias: 'class_', rawOwner: 'class_' },
  ])('never routes $label to the wrong tool, in either catalog order', async ({ names, alias, rawOwner }) => {
    for (const order of [names, [...names].reverse()]) {
      const registry = fixtureRegistry(order)
      const samples = scriptJson<string[]>(await runScript(registry, `
        return await Promise.all(${JSON.stringify(names)}.map(name => describeTool(name)));
      `))
      const expressions = samples.map(signatureExpression)
      const result = await runScript(registry, `
        const advertised = [${expressions.map(expression => `await ${expression}({ query: 'advertised' })`).join(', ')}];
        const raw = await Promise.all(${JSON.stringify(names)}.map(name => tools[name]({ query: 'raw' })));
        let alias;
        try { alias = { value: await tools.${alias}({ query: 'alias' }) }; }
        catch { alias = { refused: true }; }
        return { advertised, raw, alias };
      `)

      expect(scriptJson(result)).toEqual({
        advertised: names.map(name => `${name}:advertised`),
        raw: names.map(name => `${name}:raw`),
        alias: rawOwner ? { value: `${rawOwner}:alias` } : { refused: true },
      })
      names.forEach((name, index) => {
        if (name !== rawOwner) expect(expressions[index]).toBe(`tools[${JSON.stringify(name)}]`)
      })
    }
  })
})

function fieldSchema(name: string): Record<string, unknown> {
  return { type: 'object', required: [name], properties: { [name]: { type: 'string' } } }
}

function strictConsumerErrors(argumentType: string, valid: readonly unknown[], invalid: readonly unknown[],
  extraSource: readonly string[] = []): string[] {
  const file = path.join(temporary, 'declaration-consumer.ts')
  const source = [
    `type Arguments = ${argumentType};`,
    'declare function consume(args: Arguments): void;',
    ...valid.map(value => `consume(${JSON.stringify(value)});`),
    ...invalid.flatMap(value => [
      '// @ts-expect-error The production schema rejects this input.',
      `consume(${JSON.stringify(value)});`,
    ]),
    ...extraSource,
  ].join('\n')
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts'],
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const originalSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    path.resolve(name) === file
      ? ts.createSourceFile(name, source, languageVersion, true, ts.ScriptKind.TS)
      : originalSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile)
  const program = ts.createProgram([file], options, host)
  return ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => `${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
}

describe('strict TypeScript consumers of projected argument types', () => {
  it.each(['first', 'last', 'reference'] as const)('requires the intersection field for every %s union branch', position => {
    const alternatives = { anyOf: [fieldSchema('a'), fieldSchema('b')] }
    const common = fieldSchema('c')
    const schema = position === 'reference'
      ? { type: 'object', $defs: { Alternatives: alternatives, Common: common },
          allOf: [{ $ref: '#/$defs/Alternatives' }, { $ref: '#/$defs/Common' }] }
      : { type: 'object', allOf: position === 'first' ? [alternatives, common] : [common, alternatives] }
    const valid = [{ a: 'x', c: 'y' }, { b: 'x', c: 'y' }]
    const invalid = [{ a: 'x' }, { b: 'x' }, { c: 'y' }]
    for (const value of valid) expect(() => validateToolArguments(schema, value)).not.toThrow()
    for (const value of invalid) expect(() => validateToolArguments(schema, value)).toThrow(/constraint failed/)

    const sample = renderToolSample(fixtureTool('fixture_lookup', schema))
    expect(strictConsumerErrors(signatureArgumentType(sample), valid, invalid)).toEqual([])
  })

  it('keeps a sibling union branch independent of the other branch intersection', () => {
    const schema = { type: 'object', anyOf: [{ allOf: [fieldSchema('a'), fieldSchema('c')] }, fieldSchema('b')] }
    const valid = [{ a: 'x', c: 'y' }, { b: 'x' }]
    const invalid = [{ a: 'x' }, { c: 'y' }]
    for (const value of valid) expect(() => validateToolArguments(schema, value)).not.toThrow()
    for (const value of invalid) expect(() => validateToolArguments(schema, value)).toThrow(/constraint failed/)

    const sample = renderToolSample(fixtureTool('fixture_lookup', schema))
    expect(strictConsumerErrors(signatureArgumentType(sample), valid, invalid)).toEqual([])
  })

  it.each(['literal', 'reference'] as const)('rejects a boolean false property reached through %s schema', kind => {
    const forbidden = kind === 'literal' ? false : { $ref: '#/$defs/Forbidden' }
    const schema = { type: 'object', additionalProperties: false, required: ['allowed'],
      properties: { allowed: { type: 'string' }, forbidden }, $defs: { Forbidden: false } }
    const valid = [{ allowed: 'kept' }]
    const invalid = [{ allowed: 'kept', forbidden: 1 }, { allowed: 'kept', forbidden: null }, {}]
    for (const value of valid) expect(() => validateToolArguments(schema, value)).not.toThrow()
    for (const value of invalid) expect(() => validateToolArguments(schema, value)).toThrow(/constraint failed/)

    const sample = renderToolSample(fixtureTool('fixture_lookup', schema))
    expect(strictConsumerErrors(signatureArgumentType(sample), valid, invalid)).toEqual([])
  })

  it('preserves Draft 7 tuple element types and order for strict consumers', () => {
    const schema = { type: 'object', additionalProperties: false, required: ['pair'],
      properties: { pair: { type: 'array', minItems: 2, maxItems: 2, additionalItems: false,
        items: [{ type: 'string' }, { type: 'integer' }] } } }
    const valid = [{ pair: ['first', 2] }]
    const invalid = [{ pair: [2, 'first'] }, { pair: ['first', 'second'] }, { pair: ['first'] },
      { pair: ['first', 2, 'extra'] }]
    for (const value of valid) expect(() => validateToolArguments(schema, value)).not.toThrow()
    for (const value of invalid) expect(() => validateToolArguments(schema, value)).toThrow(/constraint failed/)

    const sample = renderToolSample(fixtureTool('fixture_lookup', schema))
    expect(strictConsumerErrors(signatureArgumentType(sample), valid, invalid)).toEqual([])
  })

  it.each(['\u2028', '\u2029'])('keeps valid property tags with a Unicode line terminator in strict TypeScript', terminator => {
    const schema = { type: 'object', additionalProperties: false, required: ['query'],
      properties: { query: { type: 'string', pattern: `^first${terminator}second$`,
        default: `first${terminator}second` } } }
    const valid = [{ query: `first${terminator}second` }]
    const invalid = [{ query: 2 }]
    for (const value of valid) expect(() => validateToolArguments(schema, value)).not.toThrow()
    for (const value of invalid) expect(() => validateToolArguments(schema, value)).toThrow(/constraint failed/)

    const sample = renderToolSample(fixtureTool('fixture_lookup', schema))
    expect(strictConsumerErrors(signatureArgumentType(sample), valid, invalid)).toEqual([])
  })
})

it('declares both actual read result shapes and requires narrowing before string operations', async () => {
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const image = { type: 'image' as const, data, mimeType: 'image/png' }
  expect(inspectImage(image)).toMatchObject({ widthPx: 1, heightPx: 1 })
  fs.writeFileSync(path.join(workspace, 'pixel.png'), Buffer.from(data, 'base64'))
  fs.writeFileSync(path.join(workspace, 'control.txt'), 'plain-text-control\n')
  const read = createReadToolDefinition(createDefaultExecutionService())
  const valid = [{ path: 'pixel.png' }, { path: 'control.txt' }]
  const invalid = [{ path: 1 }, {}]
  for (const value of valid) expect(() => validateToolArguments(read.argsSchema, value)).not.toThrow()
  for (const value of invalid) expect(() => validateToolArguments(read.argsSchema, value)).toThrow(/constraint failed/)
  const registry = new Map([[read.name, read]])
  registry.set('codemode', createCodemodeToolDefinition(() => registry))
  const observed = scriptJson<{ sample: string; media: { output: string; images: { type: 'image'; data: string; mimeType: string }[] }; plain: string }>(
    await runScript(registry, `return { sample: await describeTool('read'),
      media: await tools.read({ path: 'pixel.png' }), plain: await tools.read({ path: 'control.txt' }) };`))
  expect(observed.media.images).toHaveLength(1)
  expect(observed.media.images[0]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })
  expect(inspectImage(observed.media.images[0]!)).toMatchObject({ widthPx: 1, heightPx: 1 })
  expect(observed.media.images[0]!.data).not.toBe(data)
  expect(observed.media.output).toEqual(expect.any(String))
  expect(observed.plain).toContain('plain-text-control')
  const marker = '): Promise<'
  const resultType = observed.sample.slice(observed.sample.lastIndexOf(marker) + marker.length,
    observed.sample.lastIndexOf('>;'))
  expect(strictConsumerErrors(signatureArgumentType(observed.sample), valid, invalid, [
    `type Result = ${resultType};`,
    `const mediaResult: Result = ${JSON.stringify(observed.media)};`,
    `const plainResult: Result = ${JSON.stringify(observed.plain)};`,
    'declare const value: Result;',
    '// @ts-expect-error A read may return media, so string operations need narrowing.',
    "value.split('\\n');",
    "if (typeof value === 'string') value.split('\\n');",
    'else {',
    "  value.output.split('\\n');",
    '  const images: readonly { readonly type: "image"; readonly data: string; readonly mimeType: string }[] = value.images;',
    '}',
    '// @ts-expect-error The image data field is text, not a number.',
    'const invalidResult: Result = { output: "text", images: [{ type: "image", data: 1, mimeType: "image/png" }] };',
  ])).toEqual([])
})

it('discovers and calls only the requested MCP server namespace through the actual worker', async () => {
  const descriptors: McpToolDescriptor[] = [
    { serverName: 'github', toolName: 'search_issues', qualifiedName: 'mcp__github__search_issues',
      description: 'Find fixture issue records.', inputSchema: QUERY_SCHEMA },
    { serverName: 'github', toolName: 'get_issue', qualifiedName: 'mcp__github__get_issue',
      description: 'Get fixture issue records.', inputSchema: QUERY_SCHEMA },
    { serverName: 'github_enterprise', toolName: 'search_issues', qualifiedName: 'mcp__github_enterprise__search_issues',
      description: 'Find fixture issue records.', inputSchema: QUERY_SCHEMA },
    { serverName: 'linear', toolName: 'search_issues', qualifiedName: 'mcp__linear__search_issues',
      description: 'Find fixture issue records.', inputSchema: QUERY_SCHEMA },
  ]
  const invokeTool = vi.fn(async (server: string, name: string, args: Record<string, unknown>) => ({
    content: `${server}:${name}:${String(args.query)}`,
  }))
  const registry = createCoreToolRegistry({ mcpTools: descriptors, mcpGateway: { invokeTool } })
  const result = scriptJson<{
    namespace: { name: string; tools: string[] } | null
    enterprise: { name: string; tools: string[] } | null
    unknown: unknown
    matches: { name: string; namespace: string }[]
    unknownMatches: unknown[]
    called: string | null
  }>(await runScript(registry, `
    const namespace = await describeNamespace('mcp__github');
    const enterprise = await describeNamespace('mcp__github_enterprise');
    const unknown = await describeNamespace('mcp__missing');
    const matches = await searchTools('fixture issue records', { namespace: 'mcp__github', limit: 8 });
    const unknownMatches = await searchTools('fixture issue records', { namespace: 'mcp__missing', limit: 8 });
    const called = matches[0] ? await tools[matches[0].name]({ query: 'fixture-query' }) : null;
    return { namespace, enterprise, unknown, matches, unknownMatches, called };
  `))

  expect(result.namespace).toMatchObject({ name: 'mcp__github' })
  expect(result.namespace!.tools.slice().sort()).toEqual(['mcp__github__get_issue', 'mcp__github__search_issues'])
  expect(result.enterprise).toMatchObject({ name: 'mcp__github_enterprise', tools: ['mcp__github_enterprise__search_issues'] })
  expect(result.unknown).toBeNull()
  expect(result.matches.map(match => match.name).sort()).toEqual(['mcp__github__get_issue', 'mcp__github__search_issues'])
  expect(result.matches.every(match => match.namespace === 'mcp__github')).toBe(true)
  expect(result.unknownMatches).toEqual([])
  expect(result.called).toMatch(/^github:(?:get_issue|search_issues):fixture-query$/)
  expect(invokeTool).toHaveBeenCalledOnce()
  expect(invokeTool.mock.calls[0]?.slice(0, 3)).toEqual(['github', expect.any(String), { query: 'fixture-query' }])
})
