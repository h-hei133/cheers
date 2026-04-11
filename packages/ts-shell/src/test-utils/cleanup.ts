import { promises as fs } from 'node:fs'

export async function safeRemoveDir(target: string, attempts: number = 5): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true })
      return
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY' || index === attempts - 1) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (index + 1)))
    }
  }
}
