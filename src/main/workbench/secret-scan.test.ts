import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanSecrets, redactScanned } from './secret-scan'

const known = ['Hunter2-Staging!', 'q9Zt8mPw']
const samples = (name: string): string[] => readFileSync(resolve('src/main/workbench/__fixtures__/secret-scan', `${name}.txt`), 'utf8').trimEnd().split(/\r?\n/)
describe('v1.1 secret scan contract', () => {
  it.each(samples('clean'))('leaves ordinary code unchanged: %s', text => { expect(scanSecrets(text, known)).toEqual([]); expect(redactScanned(text, known).text).toBe(text) })
  it.each(samples('block'))('blocks known or certain formats: %s', text => { expect(scanSecrets(text, known).some(hit => hit.kind !== 'assignment')).toBe(true); expect(redactScanned(text, known).redacted).toBe(true) })
  it.each(samples('replace-only'))('only replaces a possible literal: %s', text => { const hits = scanSecrets(text, known); expect(hits.length).toBeGreaterThan(0); expect(hits.every(hit => hit.kind === 'assignment')).toBe(true) })
  it('keeps the complete original sample set', () => { expect(samples('clean')).toHaveLength(35); expect(samples('block')).toHaveLength(9); expect(samples('replace-only')).toHaveLength(4) })
  it('matches known JSON escapes, applies short-value boundaries, and merges overlapping hits', () => {
    const value = 'synthetic-quote-"-\\-value'
    expect(scanSecrets(JSON.stringify({ value }), [value])[0]?.kind).toBe('known')
    expect(scanSecrets('xxq9Zt8mPwxx pin=q9Zt8mPw;', known).filter(hit => hit.kind === 'known')).toHaveLength(1)
    expect(scanSecrets('tiny', ['tiny'])).toEqual([])
    expect(redactScanned('DB_PASSWORD=Pa55w0rd!2026', ['Pa55w0rd!2026']).text).toBe('DB_PASSWORD=[已隐藏敏感字段]')
    expect(scanSecrets('密码="R4nd0mPass!"', []).some(hit => hit.kind === 'assignment')).toBe(true)
  })
})
