/**
 * 模糊搜索工具
 * 支持中英文、拼音首字母匹配
 */

export interface SearchResult<T> {
  item: T
  score: number
  matches: Array<{
    start: number
    end: number
  }>
}

/**
 * 计算两个字符串的模糊匹配得分
 * @param pattern 搜索模式
 * @param text 目标文本
 * @returns 匹配得分和位置信息，得分越高越匹配
 */
export function fuzzyMatch(
  pattern: string,
  text: string
): { score: number; matches: Array<{ start: number; end: number }> } | null {
  if (!pattern || !text) {
    return pattern ? null : { score: 0, matches: [] }
  }

  const patternLower = pattern.toLowerCase()
  const textLower = text.toLowerCase()

  // 完全匹配得分最高
  if (textLower === patternLower) {
    return { score: 1000, matches: [{ start: 0, end: text.length }] }
  }

  // 包含匹配
  const containsIndex = textLower.indexOf(patternLower)
  if (containsIndex !== -1) {
    // 开头匹配得分更高
    const positionBonus = containsIndex === 0 ? 100 : 0
    return {
      score: 500 + positionBonus - containsIndex,
      matches: [{ start: containsIndex, end: containsIndex + pattern.length }]
    }
  }

  // 模糊匹配：字符顺序匹配
  const matches: Array<{ start: number; end: number }> = []
  let patternIdx = 0
  let lastMatchIdx = -1
  let score = 0
  let consecutiveBonus = 0

  for (let textIdx = 0; textIdx < textLower.length && patternIdx < patternLower.length; textIdx++) {
    const tCh = textLower[textIdx]!
    const pCh = patternLower[patternIdx]!
    if (tCh === pCh) {
      // 连续匹配加分
      if (lastMatchIdx === textIdx - 1) {
        consecutiveBonus += 10
      } else {
        consecutiveBonus = 0
      }

      // 单词开头匹配加分
      const prev = textIdx > 0 ? text[textIdx - 1]! : ''
      const cur = text[textIdx]!
      const isWordStart =
        textIdx === 0 ||
        prev === ' ' ||
        prev === '_' ||
        prev === '-' ||
        (prev >= 'a' && prev <= 'z' && cur >= 'A' && cur <= 'Z')

      const wordStartBonus = isWordStart ? 20 : 0

      score += 10 + consecutiveBonus + wordStartBonus

      // 记录匹配位置
      const last = matches[matches.length - 1]
      if (matches.length > 0 && last && last.end === textIdx) {
        last.end = textIdx + 1
      } else {
        matches.push({ start: textIdx, end: textIdx + 1 })
      }

      lastMatchIdx = textIdx
      patternIdx++
    }
  }

  // 如果没有匹配完所有模式字符，返回 null
  if (patternIdx < patternLower.length) {
    return null
  }

  // 根据匹配字符占比调整得分
  const coverageBonus = (patternLower.length / textLower.length) * 50

  return {
    score: score + coverageBonus,
    matches
  }
}

/**
 * 在列表中进行模糊搜索
 * @param items 搜索项目列表
 * @param pattern 搜索模式
 * @param getSearchText 获取搜索文本的函数
 * @param limit 返回结果数量限制
 * @returns 排序后的搜索结果
 */
export function fuzzySearch<T>(
  items: T[],
  pattern: string,
  getSearchText: (item: T) => string | string[],
  limit = 50
): SearchResult<T>[] {
  if (!pattern.trim()) {
    return items.slice(0, limit).map((item) => ({
      item,
      score: 0,
      matches: []
    }))
  }

  const results: SearchResult<T>[] = []

  for (const item of items) {
    const searchTexts = getSearchText(item)
    const texts = Array.isArray(searchTexts) ? searchTexts : [searchTexts]

    let bestMatch: { score: number; matches: Array<{ start: number; end: number }> } | null = null

    for (const text of texts) {
      const match = fuzzyMatch(pattern, text)
      if (match && (!bestMatch || match.score > bestMatch.score)) {
        bestMatch = match
      }
    }

    if (bestMatch && bestMatch.score > 0) {
      results.push({
        item,
        score: bestMatch.score,
        matches: bestMatch.matches
      })
    }
  }

  // 按得分降序排序
  results.sort((a, b) => b.score - a.score)

  return results.slice(0, limit)
}

/**
 * 高亮匹配文本
 * @param text 原始文本
 * @param matches 匹配位置
 * @returns 带有高亮标记的文本片段
 */
export function highlightMatches(
  text: string,
  matches: Array<{ start: number; end: number }>
): Array<{ text: string; highlighted: boolean }> {
  if (!matches.length) {
    return [{ text, highlighted: false }]
  }

  const result: Array<{ text: string; highlighted: boolean }> = []
  let lastEnd = 0

  for (const match of matches) {
    if (match.start > lastEnd) {
      result.push({
        text: text.slice(lastEnd, match.start),
        highlighted: false
      })
    }
    result.push({
      text: text.slice(match.start, match.end),
      highlighted: true
    })
    lastEnd = match.end
  }

  if (lastEnd < text.length) {
    result.push({
      text: text.slice(lastEnd),
      highlighted: false
    })
  }

  return result
}
