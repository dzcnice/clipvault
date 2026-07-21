/**
 * 密码生成器（Sprint 11 · TASK-058）
 *
 * 三函数：strong / passphrase / pin，底层用 node:crypto 的 randomInt 抽样。
 */

import { randomInt } from 'node:crypto'
import { EN_WORDS, ZH_WORDS } from './wordlist'

export interface StrongPasswordOpts {
  length: number
  includeLower?: boolean
  includeUpper?: boolean
  includeDigits?: boolean
  includeSymbols?: boolean
  /** 排除易混淆字符（O/0/l/1/I 等） */
  excludeAmbiguous?: boolean
}

export interface PassphraseOpts {
  wordCount: number
  separator?: string
  capitalize?: boolean
  includeNumber?: boolean
  language?: 'en' | 'zh'
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/|~'
const AMBIGUOUS = /[O0oIl1|`']/g

function pickRandom(source: string): string {
  if (!source) throw new Error('pickRandom: empty source')
  return source.charAt(randomInt(0, source.length))
}

function shuffle(arr: string[]): string[] {
  // Fisher-Yates with crypto randomInt
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    const tmp = arr[i] as string
    arr[i] = arr[j] as string
    arr[j] = tmp
  }
  return arr
}

/**
 * 生成强密码。默认启用全部字符集，保证至少每个已启用类别各 1 位。
 */
export function generateStrong(opts: StrongPasswordOpts): string {
  const {
    length,
    includeLower = true,
    includeUpper = true,
    includeDigits = true,
    includeSymbols = true,
    excludeAmbiguous = false
  } = opts

  if (!Number.isInteger(length) || length < 4 || length > 256) {
    throw new Error(`generateStrong: length 必须为 4~256，收到 ${length}`)
  }

  const filter = (s: string): string =>
    excludeAmbiguous ? s.replace(AMBIGUOUS, '') : s

  const pools: string[] = []
  if (includeLower) pools.push(filter(LOWER))
  if (includeUpper) pools.push(filter(UPPER))
  if (includeDigits) pools.push(filter(DIGITS))
  if (includeSymbols) pools.push(filter(SYMBOLS))

  if (pools.length === 0) {
    throw new Error('generateStrong: 至少启用一个字符集')
  }
  if (length < pools.length) {
    throw new Error('generateStrong: length 小于启用字符集数量')
  }

  // 保证每个类别至少出现一次
  const required = pools.map((p) => pickRandom(p))
  const all = pools.join('')
  const rest: string[] = []
  for (let i = required.length; i < length; i++) {
    rest.push(pickRandom(all))
  }
  return shuffle([...required, ...rest]).join('')
}

/**
 * 生成 diceware-like passphrase。
 */
export function generatePassphrase(opts: PassphraseOpts): string {
  const {
    wordCount,
    separator = '-',
    capitalize = false,
    includeNumber = false,
    language = 'en'
  } = opts

  if (!Number.isInteger(wordCount) || wordCount < 2 || wordCount > 20) {
    throw new Error(`generatePassphrase: wordCount 必须为 2~20，收到 ${wordCount}`)
  }

  const dict = language === 'zh' ? ZH_WORDS : EN_WORDS
  const words: string[] = []
  for (let i = 0; i < wordCount; i++) {
    let w = dict[randomInt(0, dict.length)] as string
    if (capitalize && language === 'en') {
      w = w.charAt(0).toUpperCase() + w.slice(1)
    }
    words.push(w)
  }
  if (includeNumber) {
    // 随机插入一个 2 位数字到某个位置
    const pos = randomInt(0, words.length + 1)
    const num = String(randomInt(10, 100))
    words.splice(pos, 0, num)
  }
  return words.join(separator)
}

/**
 * 生成纯数字 PIN，长度 4~8。
 * 注意：randomInt 均匀，对低熵 PIN 已足够。
 */
export function generatePIN(length: number): string {
  if (!Number.isInteger(length) || length < 4 || length > 8) {
    throw new Error(`generatePIN: length 必须为 4~8，收到 ${length}`)
  }
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String(randomInt(0, 10))
  }
  return out
}
