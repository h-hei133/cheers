import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleSigint } from './entrypoints/handleSigint.js'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..', '..', '..')
const cliPath = path.join(currentDir, 'entrypoints', 'cli.tsx')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const nodeExe = process.execPath

function spawnCli(fakeHome: string, ...args: string[]): ChildProcess {
  return spawn(nodeExe, [tsxCliPath, cliPath, ...args], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      USERPROFILE: fakeHome,
      HOME: fakeHome,
    },
  })
}

describe('CLI streaming baseline (T3)', () => {
  let fakeHomeDir = ''
  let sessionsDir = ''

  function whenOutputContains(
    cli: ChildProcess,
    needle: string,
    callback: () => void,
  ): void {
    let triggered = false
    const handler = (data: Buffer) => {
      if (triggered) {
        return
      }
      if (data.toString().includes(needle)) {
        triggered = true
        callback()
      }
    }

    cli.stdout?.on('data', handler)
    cli.stderr?.on('data', handler)
  }

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-cli-home-'))
    sessionsDir = path.join(fakeHomeDir, '.private-agents', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
  })

  afterEach(() => {
    if (!fs.existsSync(sessionsDir)) {
      return
    }

    for (const file of fs.readdirSync(sessionsDir)) {
      if (file.startsWith('sess_')) {
        fs.rmSync(path.join(sessionsDir, file), { recursive: true, force: true })
      }
    }

    fs.rmSync(fakeHomeDir, { recursive: true, force: true })
  })

  it('streams output incrementally without blocking', async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir)
      let output = ''

      cli.stdout?.on('data', data => {
        output += data.toString()
      })
      cli.stderr?.on('data', data => {
        output += data.toString()
      })

      setTimeout(() => {
        cli.kill()
        try {
          expect(output.length).toBeGreaterThan(0)
          expect(output).toContain('🤖 Private Coding Agents Shell (ts-shell MVP)')
          expect(output).toContain('Session: sess_')
          expect(output).toContain('Type your prompt or Ctrl+C to cancel current run, Ctrl+D to exit')
          resolve()
        } catch (error) {
          reject(error)
        }
      }, 7000)

      cli.on('error', reject)
    })
  }, 15000)

  it('persists session metadata to local filesystem', async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir)

      setTimeout(() => {
        cli.kill()
        try {
          const sessionDirs = fs
            .readdirSync(sessionsDir)
            .filter(file => file.startsWith('sess_'))
          expect(sessionDirs.length).toBeGreaterThan(0)
          const firstSessionDir = path.join(sessionsDir, sessionDirs[0])
          expect(fs.existsSync(path.join(firstSessionDir, 'metadata.json'))).toBe(true)
          expect(fs.existsSync(path.join(firstSessionDir, 'state.json'))).toBe(true)
          resolve()
        } catch (error) {
          reject(error)
        }
      }, 2500)

      cli.on('error', reject)
    })
  }, 10000)

  it('handles Ctrl+C interrupt gracefully', () => {
    const rendered: string[] = []
    const sessionCalls: string[] = []
    const controller = new AbortController()
    let promptCalled = false

    const nextController = handleSigint({
      currentRunController: controller,
      renderer: {
        renderLine(line: string) {
          rendered.push(line)
        },
      } as never,
      sessionManager: {
        saveInterrupted(sessionId: string) {
          sessionCalls.push(`interrupted:${sessionId}`)
        },
        saveTerminated(sessionId: string) {
          sessionCalls.push(`terminated:${sessionId}`)
        },
      } as never,
      sessionId: 'sess_test',
      readline: {
        prompt() {
          promptCalled = true
        },
        close() {},
      } as never,
      exit() {
        throw new Error('exit should not be called when cancelling a run')
      },
    })

    expect(controller.signal.aborted).toBe(true)
    expect(nextController).toBeNull()
    expect(rendered).toContain('\n⚠️  Run cancelled by user (Ctrl+C)')
    expect(sessionCalls).toContain('interrupted:sess_test')
    expect(promptCalled).toBe(true)
  })

  it('supports --version flag', async () => {
    await new Promise<void>((resolve, reject) => {
      const cli = spawnCli(fakeHomeDir, '--version')
      let output = ''

      cli.stdout?.on('data', data => {
        output += data.toString()
      })
      cli.stderr?.on('data', data => {
        output += data.toString()
      })

      cli.on('close', code => {
        try {
          expect(code).toBe(0)
          expect(output).toContain('0.1.0')
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      cli.on('error', reject)
    })
  }, 10000)
})
