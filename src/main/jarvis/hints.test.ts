import { describe, expect, it } from 'vitest'
import { HINT_LIMITS, HintGate, hintFor } from './hints'
import type { ClipboardItem } from '../../types'

const all = { error: true, image: true, credential: true, translate: true }
const clip = (patch: Partial<ClipboardItem>): ClipboardItem => ({ id: 'c1', type: 'text', preview: '', content: '', createdAt: 1, tags: [], isPinned: false, sourceApp: 'chrome', ...patch } as ClipboardItem)

describe('Jarvis hints', () => {
  it('suggests the right action for errors, screenshots, account strings and long English text', () => {
    expect(hintFor(clip({ category: 'error', content: 'TypeError: x is undefined' }), all)).toMatchObject({ kind: 'error', action: '问 Jarvis 怎么修' })
    expect(hintFor(clip({ type: 'image' as ClipboardItem['type'], category: 'image' }), all)).toMatchObject({ kind: 'image', action: '问这张图' })
    expect(hintFor(clip({ category: 'credential' }), all)).toMatchObject({ kind: 'credential', action: '存为资源' })
    const english = 'This is a fairly long English paragraph that someone copied from a documentation page about configuring the build pipeline correctly for production.'
    expect(hintFor(clip({ category: 'text', content: english }), all)).toMatchObject({ kind: 'translate' })
    expect(hintFor(clip({ category: 'text', content: '一段普通的中文文字，没有什么需要提示的。' }), all)).toBeNull()
  })
  it('respects the per-kind switches, skips own app copies and saved snippets', () => {
    expect(hintFor(clip({ category: 'error' }), { ...all, error: false })).toBeNull()
    expect(hintFor(clip({ category: 'error', sourceApp: 'ClipVault Workbench Preview' }), all)).toBeNull()
    expect(hintFor(clip({ category: 'error', isSnippet: true }), all)).toBeNull()
    expect(hintFor(clip({ category: 'text', content: 'x '.repeat(200) }), { ...all, translate: false })).toBeNull()
  })
  it('rate-limits hints so they never pile up', () => {
    const gate = new HintGate(), t = 1_000_000
    expect(gate.allow('error', t)).toBe(true)
    expect(gate.allow('image', t + 1000)).toBe(false)
    expect(gate.allow('image', t + HINT_LIMITS.anyMs)).toBe(true)
    expect(gate.allow('error', t + HINT_LIMITS.anyMs * 2)).toBe(false)
    expect(gate.allow('error', t + HINT_LIMITS.sameKindMs)).toBe(true)
  })
})
