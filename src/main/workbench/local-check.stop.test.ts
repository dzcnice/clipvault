import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'

vi.mock('node:child_process', () => ({
  spawn: () => Object.assign(new EventEmitter(), { pid: 99999, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() }),
  execFile: (_file: string, _args: string[], _options: unknown, callback: (error: Error) => void) => callback(new Error('Fixture: process stop denied'))
}))
import { LocalCheckStopError, runLocalCheck } from './local-check'

describe.skipIf(process.platform !== 'win32')('unconfirmed local process termination', () => {
  it('returns an explicit uncertain-stop error instead of waiting forever or claiming the process stopped', async () => {
    await expect(runLocalCheck(resolve('out'), resolve('test-fixtures/no-project'), 'node --test test.cjs', new AbortController().signal,
      resolve('resources/harness-runtime'), 20)).rejects.toBeInstanceOf(LocalCheckStopError)
  }, 2000)
})
