import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { after, test } from 'node:test'
import { inspectRuntimeConfig } from './support/config.mjs'

const testRoot = path.join(os.tmpdir(), 'cheers-test')
fs.mkdirSync(testRoot, { recursive: true })
const scratch = fs.mkdtempSync(path.join(testRoot, 'config-scripts-'))
const workspace = path.join(scratch, 'workspace')
fs.mkdirSync(workspace)
after(() => fs.rmSync(scratch, { recursive: true, force: true }))

// Every provider/config environment value is isolated from the operator's setup.
for (const name of Object.keys(process.env)) {
  if (/^(CHEERS_|OPENAI_|ANTHROPIC_|GOOGLE_|GEMINI_|VERTEX_|AWS_|AZURE_|COPILOT_|GITHUB_|CLAUDECODE_|ANTIGRAVITY_|DEEPSEEK_|MISTRAL_|GROQ_|XAI_|TOGETHER_|FIREWORKS_|OLLAMA_)/.test(name)) delete process.env[name]
}
process.env.CHEERS_PROVIDER_PROXY = 'off'
process.env.GIT_CEILING_DIRECTORIES = scratch

const sentinel = `synthetic-${randomUUID()}`
const model = 'fixture-model'
const provider = 'openai-compatible'

function fixture(settings, auth, directory = '.cheers') {
  const home = fs.mkdtempSync(path.join(scratch, 'home-'))
  const root = path.join(home, directory)
  fs.mkdirSync(root, { recursive: true })
  if (settings !== undefined) write(path.join(root, 'config.json'), settings)
  if (auth !== undefined) write(path.join(root, 'auth.json'), auth)
  return { home, root }
}

function write(file, value) {
  fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 })
}

function auth(baseUrl = 'https://example.invalid/v1', patch = {}) {
  return { provider, activeProviderConnectionId: 'selected', providerConnections: [
    { id: 'selected', provider, authType: 'api-key', apiKey: sentinel, baseUrl, ...patch },
  ] }
}

function settings() {
  return { theme: 'dark', modelPreferences: { connections: [{ id: 'selected', provider, model }] } }
}

function safe(value) {
  assert.equal(JSON.stringify(value).includes(sentinel), false, 'Secret material escaped the bridge')
  assert.equal(Object.hasOwn(value, 'apiKey'), false)
  assert.equal(Object.hasOwn(value, 'baseUrl'), false)
  assert.equal(Object.hasOwn(value, 'model'), false)
  return value
}

function snapshot(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? snapshot(file) : [[file, fs.readFileSync(file).toString('base64'), fs.statSync(file).mode]]
  })
}

async function runScript(name, args, home) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('scripts', name), ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home, CHEERS_REAL_HOME: home,
        CHEERS_SYNTHETIC_HOME: home, CHEERS_TEST_ROOT: scratch, NODE_OPTIONS: '--max-old-space-size=1024' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); resolve(safe({ code, output })) })
  })
}

async function server(t, handler) {
  const instance = http.createServer(handler)
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve))
  t.after(() => { instance.closeAllConnections(); instance.close() })
  return `http://127.0.0.1:${instance.address().port}/v1`
}

test('split documents join defaults and leave all user state unchanged', async () => {
  const { home } = fixture(settings(), auth())
  const before = snapshot(home)
  const result = safe(await inspectRuntimeConfig(home, workspace))
  assert.equal(result.ok, true)
  assert.equal(result.present, true)
  assert.equal(result.provider, provider)
  assert.equal(result.activeConnectionId, 'selected')
  assert.equal(result.credentialSource, 'connection')
  assert.equal(result.hasCredential, true)
  assert.equal(result.modelPresent, true)
  assert.deepEqual(snapshot(home), before)
})

test('auth-only, settings-only and legacy sources use runtime fallback without migration', async () => {
  const cases = [fixture(undefined, auth()), fixture({ ...auth(), providerConnections: auth().providerConnections.map(item => ({ ...item, model })) }),
    fixture({ provider, providerCredentials: { [provider]: { apiKey: sentinel, baseUrl: 'https://example.invalid/v1', model } } }, undefined, '.cheer')]
  for (const { home } of cases) {
    const before = snapshot(home)
    const result = safe(await inspectRuntimeConfig(home, workspace))
    assert.equal(result.ok, true)
    assert.equal(result.present, true)
    assert.equal(result.hasCredential, true)
    assert.deepEqual(snapshot(home), before)
  }
})

test('absent documents and missing HOME never create user directories', async () => {
  const { home, root } = fixture()
  fs.rmdirSync(root)
  const result = safe(await inspectRuntimeConfig(home, workspace))
  assert.equal(result.ok, true)
  assert.equal(result.present, false)
  assert.deepEqual(fs.readdirSync(home), [])
  const missing = path.join(home, 'missing')
  assert.equal(safe(await inspectRuntimeConfig(missing, workspace)).ok, false)
  assert.equal(fs.existsSync(missing), false)
})

test('named profile isolates default/legacy credentials and refuses missing or linked profiles', async () => {
  const { home } = fixture(settings(), auth())
  const named = path.join(home, '.cheers/profiles/work')
  fs.mkdirSync(named, { recursive: true })
  write(path.join(named, 'auth.json'), { provider: 'openai' })
  const before = snapshot(home)
  process.env.CHEERS_PROFILE = 'work'
  try {
    const result = safe(await inspectRuntimeConfig(home, workspace))
    assert.equal(result.ok, true)
    assert.equal(result.provider, 'openai')
    assert.equal(result.hasCredential, false)
    assert.equal(result.activeConnectionId, null)
    process.env.CHEERS_PROFILE = 'missing'
    assert.equal(safe(await inspectRuntimeConfig(home, workspace)).ok, false)
    assert.deepEqual(snapshot(home), before)
    fs.symlinkSync(named, path.join(home, '.cheers/profiles/link'), 'dir')
    process.env.CHEERS_PROFILE = 'link'
    assert.equal(safe(await inspectRuntimeConfig(home, workspace)).ok, false)
  } finally { delete process.env.CHEERS_PROFILE }
})

test('malformed, invalid and unreadable documents refuse with value-free diagnostics', async () => {
  const malformed = fixture(settings(), auth())
  fs.writeFileSync(path.join(malformed.root, 'auth.json'), `{"apiKey":"${sentinel}"`)
  const invalid = fixture(settings(), { provider: sentinel })
  const unreadable = fixture(settings())
  fs.mkdirSync(path.join(unreadable.root, 'auth.json'))
  const dangling = fixture(settings())
  fs.symlinkSync(path.join(dangling.root, 'missing'), path.join(dangling.root, 'auth.json'))
  for (const { home } of [malformed, invalid, unreadable, dangling]) {
    const result = safe(await inspectRuntimeConfig(home, workspace))
    assert.equal(result.ok, false)
    assert.equal(result.status, 'config-failure')
  }
})

test('environment priority, pending connection and closed pool use the credential owner', async () => {
  process.env.OPENAI_COMPATIBLE_API_KEY = sentinel
  try {
    const { home } = fixture(settings(), auth())
    assert.equal(safe(await inspectRuntimeConfig(home, workspace)).credentialSource, 'env')
    const pending = fixture(settings(), auth(undefined, { status: 'pending' }))
    const result = safe(await inspectRuntimeConfig(pending.home, workspace))
    assert.equal(result.ok, true)
    assert.equal(result.blocked, true)
    assert.equal(result.hasCredential, false)
    const pool = fixture(settings(), { ...auth(), accountPool: { [provider]: { connections: [] } } })
    assert.equal(safe(await inspectRuntimeConfig(pool.home, workspace)).blocked, true)
    const owned = fixture(settings(), { ...auth(), accountPool: { [provider]: { connections: ['selected'] } } })
    assert.equal(safe(await inspectRuntimeConfig(owned.home, workspace)).credentialSource, 'connection')
  } finally { delete process.env.OPENAI_COMPATIBLE_API_KEY }
})

test('explicit empty model owner prevents legacy defaults from reviving', async () => {
  const { home } = fixture({ modelPreferences: { connections: [{ id: 'selected', provider }] } }, auth(undefined, { model: 'legacy' }))
  const result = safe(await inspectRuntimeConfig(home, workspace))
  assert.equal(result.ok, true)
  assert.equal(result.modelPresent, false)
})

test('readiness preflight accepts split defaults and reports invalid sources without secrets', async () => {
  const { home, root } = fixture(settings(), auth())
  const before = snapshot(home)
  const result = await runScript('verify-provider-readiness.mjs', ['--preflight-only'], home)
  assert.equal(result.code, 0)
  assert.match(result.output, /provider-readiness-preflight/)
  assert.match(result.output, /model=present/)
  assert.deepEqual(snapshot(home), before)
  fs.writeFileSync(path.join(root, 'auth.json'), sentinel)
  const refused = await runScript('verify-provider-readiness.mjs', ['--preflight-only'], home)
  assert.equal(refused.code, 3)
  assert.match(refused.output, /config-failure/)
})

test('doctor accepts auth-only documents while keeping authentication unverified', async () => {
  const { home } = fixture(undefined, auth())
  const result = await runScript('verify-doctor-environment.mjs', [], home)
  assert.equal(result.code, 0)
  assert.match(result.output, /selected configuration documents parsed/)
  assert.match(result.output, /authentication not checked/)
})

test('daily and broader select explicit auth-only HOME and read its joined active connection', async () => {
  const { home, root } = fixture(undefined, auth())
  process.env.CHEERS_TEST_HOME = home
  try {
    for (const name of ['daily-regression.mjs', 'broader-regression.mjs']) {
      // These entrypoints create Windows fixtures at import time. Invoke only the owning
      // function declarations, with filesystem effects refused, using the real bridge.
      const source = fs.readFileSync(path.resolve('scripts', name), 'utf8')
      const homeFunction = source.match(/(?:async )?function resolveHomeDir\(\) \{[\s\S]*?\n\}/)?.[0]
      const connectionFunction = source.match(/(?:async )?function readActiveConnectionId\(\) \{[\s\S]*?\n\}/)?.[0]
      assert.ok(homeFunction)
      assert.ok(connectionFunction)
      const guardedFs = { ...fs, mkdirSync: () => { throw new Error('Unexpected fixture creation') } }
      const choose = new Function('inspectRuntimeConfig', 'process', 'fs', 'path', 'projectRoot', `${homeFunction}; return resolveHomeDir()`)
      assert.equal(await choose(inspectRuntimeConfig, process, guardedFs, path, workspace), home)
      const read = new Function('inspectRuntimeConfig', 'fs', 'path', 'homeDir', 'projectRoot', `${connectionFunction}; return readActiveConnectionId()`)
      assert.equal(await read(inspectRuntimeConfig, guardedFs, path, home, workspace), 'selected')
      fs.writeFileSync(path.join(root, 'auth.json'), sentinel)
      await assert.rejects(async () => read(inspectRuntimeConfig, guardedFs, path, home, workspace))
      write(path.join(root, 'auth.json'), auth())
    }
  } finally { delete process.env.CHEERS_TEST_HOME }
})

test('baseline uses split model and exact authorization, drains stream and reports no body', async t => {
  let validRequest = false
  const baseUrl = await server(t, (request, response) => {
    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', () => {
      const value = JSON.parse(body)
      validRequest = request.url === '/v1/chat/completions' && request.headers.authorization === `Bearer ${sentinel}`
        && value.model === model && value.stream === true && !Object.hasOwn(value, 'tools')
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(sentinel)
      setTimeout(() => response.end('\ndata: [DONE]\n'), 80)
    })
  })
  const { home } = fixture(settings(), auth(baseUrl))
  const result = safe(await inspectRuntimeConfig(home, workspace, { operation: 'baseline', expectedBaseUrl: baseUrl, expectedModel: model }))
  assert.equal(validRequest, true, 'The baseline request did not use the owning credential and model')
  assert.equal(result.ok, true)
  assert.equal(result.httpStatus, 200)
  assert.equal(result.responseBodyPresent, true)
})

test('mismatched baseline and pending connection never dispatch requests', async t => {
  let requests = 0
  const baseUrl = await server(t, (_request, response) => { requests++; response.end() })
  const { home } = fixture(settings(), auth(baseUrl))
  for (const options of [{ expectedModel: 'different', expectedBaseUrl: baseUrl }, { expectedModel: model, expectedBaseUrl: `${baseUrl}/different` }]) {
    assert.equal(safe(await inspectRuntimeConfig(home, workspace, { operation: 'baseline', ...options })).ok, false)
  }
  const pending = fixture(settings(), auth(baseUrl, { status: 'pending' }))
  assert.equal(safe(await inspectRuntimeConfig(pending.home, workspace, { operation: 'baseline', expectedModel: model, expectedBaseUrl: baseUrl })).ok, false)
  assert.equal(requests, 0)
})

test('HTTP refusal and redirects never report response bodies or forward credentials', async t => {
  let forwarded = false
  const destination = await server(t, (_request, response) => { forwarded = true; response.end(sentinel) })
  let status = 401
  const baseUrl = await server(t, (_request, response) => {
    response.writeHead(status, { location: destination })
    response.end(sentinel)
  })
  const { home } = fixture(settings(), auth(baseUrl))
  const options = { operation: 'baseline', expectedModel: model, expectedBaseUrl: baseUrl }
  const refused = safe(await inspectRuntimeConfig(home, workspace, options))
  assert.equal(refused.ok, false)
  assert.equal(refused.httpStatus, 401)
  status = 302
  const redirected = safe(await inspectRuntimeConfig(home, workspace, options))
  assert.equal(redirected.ok, false)
  assert.equal(redirected.status, 'provider-network-inconclusive')
  assert.equal(forwarded, false)
})

test('a stream that breaks after its first chunk remains inconclusive', async t => {
  const baseUrl = await server(t, (_request, response) => {
    response.writeHead(200)
    response.write(sentinel)
    setTimeout(() => response.destroy(), 80)
  })
  const { home } = fixture(settings(), auth(baseUrl))
  const result = safe(await inspectRuntimeConfig(home, workspace, { operation: 'baseline', expectedModel: model, expectedBaseUrl: baseUrl }))
  assert.equal(result.ok, false)
  assert.equal(result.status, 'provider-network-inconclusive')
})

test('stable links work but same-byte auth retarget during response refuses publication', async t => {
  let mutate = () => {}
  const baseUrl = await server(t, (_request, response) => { mutate(); response.end('complete') })
  const { home, root } = fixture(settings(), auth(baseUrl))
  const source = path.join(root, 'auth.json')
  const first = path.join(root, 'first.json')
  const second = path.join(root, 'second.json')
  fs.renameSync(source, first)
  fs.copyFileSync(first, second)
  fs.symlinkSync(first, source)
  const options = { operation: 'baseline', expectedModel: model, expectedBaseUrl: baseUrl }
  assert.equal(safe(await inspectRuntimeConfig(home, workspace, options)).ok, true)
  mutate = () => { fs.unlinkSync(source); fs.symlinkSync(second, source) }
  const result = safe(await inspectRuntimeConfig(home, workspace, options))
  assert.equal(result.ok, false)
  assert.equal(result.status, 'config-failure')
})

test('settings and catalogue changes during the baseline refuse stale success', async t => {
  let mutate = () => {}
  const baseUrl = await server(t, (_request, response) => { mutate(); response.end('complete') })
  for (const document of ['config.json', 'models.json']) {
    const { home, root } = fixture(settings(), auth(baseUrl))
    mutate = () => write(path.join(root, document), document === 'config.json' ? { ...settings(), theme: 'light' }
      : { providers: { 'fixture-catalogue': { runtime: provider, baseUrl, models: [] } } })
    const result = safe(await inspectRuntimeConfig(home, workspace, { operation: 'baseline', expectedModel: model, expectedBaseUrl: baseUrl }))
    assert.equal(result.ok, false)
    assert.equal(result.status, 'config-failure')
  }
})
