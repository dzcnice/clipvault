import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { classifyClip, matchProject, CLIP_CATEGORIES } from './classify'
import type { WorkProject } from '../../types/workbench'
const fixtures = JSON.parse(readFileSync(resolve('src/main/clipboard/__fixtures__/classification.json'), 'utf8')) as Record<string, string[]>
describe('local clipboard classification', () => {
  it.each(CLIP_CATEGORIES)('classifies at least ten fixed %s examples with >=90%% accuracy', category => {
    const samples = fixtures[category]!
    expect(samples.length).toBeGreaterThanOrEqual(10)
    expect(samples.filter(text => classifyClip({ type: category === 'image' ? 'image' : 'text', text }).category === category).length / samples.length).toBeGreaterThanOrEqual(0.9)
  })
  it('matches directory prefixes, repository names and package names without partial-word matches', () => {
    const project = { id: 'fixture', directory: 'C:\\work\\project-example', name: '项目', archived: false, packageName: '@example/package' } as WorkProject
    expect(matchProject('at c:/work/project-example/src/main.ts:5', [project])).toBe('fixture')
    expect(matchProject('project-example: build failed', [project])).toBe('fixture')
    expect(matchProject('@example/package crashed', [project])).toBe('fixture')
    expect(matchProject('project-example-extra', [project])).toBeNull()
  })
  it('classifies typical samples in under five milliseconds per item without I/O', () => {
    const samples = Object.values(fixtures).flat(), started = performance.now()
    for (let n = 0; n < 100; n++) for (const text of samples) classifyClip({ type: 'text', text })
    expect((performance.now() - started) / (samples.length * 100)).toBeLessThan(5)
  })
})
