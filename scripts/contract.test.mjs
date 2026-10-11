import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runTests } from './support/contract.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function stopped(pid) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { process.kill(pid, 0) } catch (error) {
      if (error.code === 'ESRCH') return true
      throw error
    }
    await delay(25)
  }
  return false
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`a ${signal} interruption stops the owned runner and restores process listeners`,
    { skip: process.platform === 'win32', timeout: 10000 }, async () => {
      const base = path.join(repoRoot, '.tmp')
      fs.mkdirSync(base, { recursive: true })
      const root = fs.mkdtempSync(path.join(base, 'contract-signal-'))
      const pidFile = path.join(root, 'runner.pid')
      const resultFile = path.join(root, 'result.json')
      const runner = path.join(root, 'runner.mjs')
      const ownerFile = path.join(root, 'owner.mjs')
      fs.writeFileSync(runner, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`)
      fs.writeFileSync(ownerFile, `import fs from 'node:fs'; import { runTests } from ${JSON.stringify(new URL('./support/contract.mjs', import.meta.url).href)};
const signals = ['SIGINT', 'SIGTERM', 'exit'];
const before = signals.map(signal => process.listenerCount(signal));
const result = await runTests(${JSON.stringify(runner)}, '', {}, [], ${JSON.stringify(root)}, 5000);
fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ ...result, listenersRestored: before.every((count, i) => process.listenerCount(signals[i]) === count) }));
process.exitCode = result.interrupted ? 1 : 0;
`)
      const owner = spawn(process.execPath, [ownerFile], { stdio: 'ignore', cwd: root })
      const closed = new Promise((resolve, reject) => { owner.once('error', reject); owner.once('close', code => resolve(code)) })
      const deadline = setTimeout(() => owner.kill('SIGKILL'), 7000)
      try {
        for (let attempt = 0; !fs.existsSync(pidFile) && attempt < 100; attempt++) await delay(25)
        assert.ok(fs.existsSync(pidFile), 'the real runner must start before interruption')
        assert.equal(owner.kill(signal), true)
        assert.equal(await closed, 1)
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
        assert.equal(result.interrupted, signal)
        assert.equal(result.timedOut, false)
        assert.equal(result.cleanupUnconfirmed, false)
        assert.equal(result.listenersRestored, true)
        assert.equal(await stopped(Number(fs.readFileSync(pidFile, 'utf8'))), true)
      } finally {
        clearTimeout(deadline)
        owner.kill('SIGKILL')
        await closed
        if (fs.existsSync(pidFile)) {
          const pid = Number(fs.readFileSync(pidFile, 'utf8'))
          try { process.kill(-pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
          assert.equal(await stopped(pid), true)
        }
        fs.rmSync(root, { recursive: true, force: true })
      }
    })
}

for (const detached of [false, true]) {
  test(`a timed out runner settles and preserves cleanup truth for ${detached ? 'escaped' : 'owned'} descendants`,
    { skip: process.platform === 'win32', timeout: 10000 }, async () => {
      const base = path.join(repoRoot, '.tmp')
      fs.mkdirSync(base, { recursive: true })
      const root = fs.mkdtempSync(path.join(base, 'contract-process-'))
      const pidFile = path.join(root, 'descendant.pid')
      const runner = path.join(root, 'runner.mjs')
      fs.writeFileSync(runner, `import fs from 'node:fs'; import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit', detached: ${detached} });
fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
setInterval(() => {}, 1000);
`)
      try {
        const result = await runTests(runner, path.join(root, 'unused.json'), {}, [], root, 1500)
        const pid = Number(fs.readFileSync(pidFile, 'utf8'))
        assert.equal(result.timedOut, true)
        assert.notEqual(result.code, 0)
        assert.equal(result.cleanupUnconfirmed, detached)
        assert.equal(await stopped(pid), !detached)
      } finally {
        if (fs.existsSync(pidFile)) {
          const pid = Number(fs.readFileSync(pidFile, 'utf8'))
          try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
          assert.equal(await stopped(pid), true, 'the probe must not leave its escaped descendant running')
        }
        fs.rmSync(root, { recursive: true, force: true })
      }
    })
}
