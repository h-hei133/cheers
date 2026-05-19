import { spawn } from 'node:child_process'

export function createCommandRunner({ defaultCwd, defaultTimeoutMs = 300000 } = {}) {
  return function run(command, args, options = {}) {
    return new Promise((resolve) => {
      const env = {}
      for (const [key, value] of Object.entries({ ...process.env, ...(options.env ?? {}) })) {
        if (typeof value === 'string') env[key] = value
      }
      const child = spawn(command, args, {
        cwd: options.cwd ?? defaultCwd ?? process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, options.timeoutMs ?? defaultTimeoutMs)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        resolve({
          code: -1,
          timedOut: false,
          stdout,
          stderr: `${stderr}${error.message}`,
          output: `${stdout}${stderr}${error.message}`,
        })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
      })
    })
  }
}
