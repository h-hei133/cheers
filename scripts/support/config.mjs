import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const entry = fileURLToPath(import.meta.url)
const root = path.resolve(path.dirname(entry), '../..')
const require = createRequire(import.meta.url)
const failure = () => ({ ok: false, status: 'config-failure', reason: 'Configuration could not be read or its captured source changed.' })

/** A fixed worker imports the runtime owner; secrets never enter argv or its result. */
export async function inspectRuntimeConfig(home, workspace, options = {}) {
  if (!home) return failure()
  const result = await new Promise(resolve => {
    const [major, minor] = process.versions.node.split('.').map(Number)
    const loader = major > 20 || major === 20 && minor >= 6 || major === 18 && minor >= 19 ? '--import' : '--loader'
    const child = spawn(process.execPath, [loader, pathToFileURL(require.resolve('tsx')).href, path.join(path.dirname(entry), 'config-worker.mjs')], {
      cwd: root, stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, HOME: path.resolve(home), USERPROFILE: path.resolve(home),
        NODE_OPTIONS: '--max-old-space-size=1024', TSX_DISABLE_CACHE: '1', CHEERS_PROVIDER_TRANSPORT_DIAGNOSTICS: 'off' },
    })
    let stdout = ''; let failed = false
    const stop = () => { failed = true; child.kill('SIGKILL') }
    const timer = setTimeout(stop, options.operation === 'baseline' ? 35_000 : 15_000)
    child.stdout.on('data', chunk => {
      if (failed) return
      if (Buffer.byteLength(stdout) + chunk.length > 64 * 1024) { stop(); return }
      stdout += chunk
    })
    child.stdin.on('error', stop)
    child.on('error', () => { clearTimeout(timer); resolve({ failed: true }) })
    child.on('close', code => { clearTimeout(timer); resolve({ failed: failed || code !== 0, stdout }) })
    child.stdin.end(JSON.stringify({ workspace, operation: options.operation ?? 'inspect',
      expectedBaseUrl: options.expectedBaseUrl, expectedModel: options.expectedModel }))
  })
  if (result.failed) return failure()
  try {
    const value = JSON.parse(result.stdout)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return failure()
    if (value.ok !== true) return { ...failure(), ...pick(value, ['status', 'reason', 'httpStatus']) }
    return { ok: true, ...pick(value, ['present', 'provider', 'activeConnectionId', 'credentialSource', 'authMode',
      'hasCredential', 'endpointPresent', 'modelPresent', 'requiresModel', 'blocked', 'status', 'httpStatus', 'responseBodyPresent']) }
  } catch { return failure() }
}

function pick(value, keys) {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))
}

