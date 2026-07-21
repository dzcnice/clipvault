/**
 * Sprint 13 / TASK-071 三重验证 challenge 构造器
 *
 * 输入：真实的 24 词 mnemonic（UI 抄录页传回）
 * 输出：sequence / pick / fill 三种挑战形式；UI 组织答题后
 *       调 `verifyMnemonic` 做最终校验。
 *
 * 注意：本模块是 "UI 挑战助手"，不直接访问存储；服务端最终校验
 *       以 phrase.verifyMnemonic 为准。
 */

import * as crypto from 'crypto'
import { wordlists } from 'bip39'
import type { RecoveryVerifyChallenge, RecoveryVerifyMode } from '../../types/recovery'

const EN_WORDS = wordlists.english ?? []

/** Fisher-Yates shuffle（crypto-grade 随机） */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

function pickDistractors(exclude: string[], count: number): string[] {
  if (EN_WORDS.length === 0) {
    // 回退：用 exclude 循环填充（极度异常场景）
    return new Array(count).fill(exclude[0] ?? '')
  }
  const set = new Set(exclude)
  const picked: string[] = []
  let guard = 0
  while (picked.length < count && guard < count * 20) {
    guard++
    const w = EN_WORDS[crypto.randomInt(0, EN_WORDS.length)] as string
    if (!set.has(w)) {
      picked.push(w)
      set.add(w)
    }
  }
  return picked
}

export function buildChallenge(
  mnemonic: string[],
  mode: RecoveryVerifyMode
): RecoveryVerifyChallenge {
  if (mnemonic.length !== 24) {
    throw new Error('buildChallenge 需要 24 词')
  }
  if (mode === 'sequence') {
    return { mode: 'sequence' }
  }
  if (mode === 'pick') {
    // 48 词池 = 真 24 + 干扰 24，打乱顺序
    const distractors = pickDistractors(mnemonic, 24)
    return { mode: 'pick', pool: shuffle([...mnemonic, ...distractors]) }
  }
  // fill：5-8 个空位
  const blankCount = 5 + crypto.randomInt(0, 4) // 5..8
  const indices = shuffle(
    Array.from({ length: 24 }, (_, i) => i)
  ).slice(0, blankCount)
  indices.sort((a, b) => a - b)
  const masked = mnemonic.map((w, i) =>
    indices.includes(i) ? '___' : w
  )
  return { mode: 'fill', blanks: indices, masked }
}
