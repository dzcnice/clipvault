import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseCheckCommand, runLocalCheck, checkEnvironment } from './local-check'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(): Promise<{ root: string; stage: string; source: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cv-local-check-')); roots.push(root)
  const stage = join(root, 'snapshot'), source = join(root, 'project')
  await mkdir(stage); await mkdir(source)
  return { root, stage, source }
}
describe('local approved project checks', () => {
  it('accepts test commands and rejects shell chaining, escapes and dependency installation', () => {
    expect(parseCheckCommand('node --test "test/my test.js"')).toEqual(['node', '--test', 'test/my test.js'])
    expect(parseCheckCommand('npm run test:unit -- --run')).toEqual(['npm', 'run', 'test:unit', '--', '--run'])
    for (const command of ['npm install', 'node -e "process.exit()"', 'npm test & whoami', 'node --test ../outside.js', 'node --test C:\\outside.js', 'npm test\nwhoami', 'node --test --import=evil', 'node --test -r external', 'node --test --test-reporter-destination=../outside.txt', 'npm test --prefix=../outside', 'npm test --prefix=other', 'npm test --script-shell=custom', 'npm test -g']) expect(() => parseCheckCommand(command)).toThrow()
    expect(checkEnvironment('C:\\owned', 'C:\\node.exe')).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(checkEnvironment('C:\\owned', 'C:\\node.exe')).not.toHaveProperty('OPENAI_API_KEY')
  })
  it('runs real Node tests in the copy and leaves the original dependencies intact when the copy is removed', async () => {
    const { stage, source } = await fixture()
    await mkdir(join(source, 'node_modules'))
    await writeFile(join(source, 'node_modules', 'keep.txt'), 'original dependency')
    await writeFile(join(stage, 'test.cjs'), "const {test}=require('node:test'); const assert=require('node:assert/strict'); test('sum',()=>assert.equal(1+1,2))")
    const result = await runLocalCheck(stage, source, 'node --test test.cjs', new AbortController().signal, resolve('resources/harness-runtime'))
    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/pass 1|tests 1/)
    await rm(stage, { recursive: true, force: true })
    expect(await readFile(join(source, 'node_modules', 'keep.txt'), 'utf8')).toBe('original dependency')
  })
  it('ends a hanging local test at the time limit', async () => {
    const { stage, source } = await fixture()
    await writeFile(join(stage, 'hang.cjs'), 'setInterval(()=>{},1000)')
    await expect(runLocalCheck(stage, source, 'node --test hang.cjs', new AbortController().signal, resolve('resources/harness-runtime'), 250)).rejects.toThrow('运行时限')
  }, 15000)
})
