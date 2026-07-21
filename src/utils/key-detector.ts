/**
 * 密钥格式检测器
 * KR 2.3: 智能识别与自动分类
 */

import { KEY_PATTERNS, KeyPattern } from './key-patterns'

export interface DetectionResult {
  /** 是否检测到密钥 */
  detected: boolean
  /** 匹配到的模式 */
  pattern?: KeyPattern
  /** 匹配到的文本 */
  matchedText?: string
  /** 匹配位置 */
  position?: {
    start: number
    end: number
  }
  /** 置信度 (0-1) */
  confidence: number
}

export interface MultiDetectionResult {
  /** 检测到的所有密钥 */
  results: DetectionResult[]
  /** 是否包含敏感信息 */
  containsSensitive: boolean
  /** 主要检测结果（置信度最高的） */
  primary?: DetectionResult
}

/**
 * 校验 pattern 的 requiresContext 是否在完整文本里出现。
 * 对大小写不敏感。未配置 requiresContext 的 pattern 始终返回 true。
 */
function satisfiesContext(pattern: KeyPattern, fullText: string): boolean {
  if (!pattern.requiresContext || pattern.requiresContext.length === 0) {
    return true
  }
  const lower = fullText.toLowerCase()
  return pattern.requiresContext.some((kw) => lower.includes(kw.toLowerCase()))
}

/**
 * 检测文本中是否包含密钥
 * @param text 要检测的文本
 * @returns 检测结果
 */
export function detectKey(text: string): DetectionResult {
  if (!text || text.length < 10) {
    return { detected: false, confidence: 0 }
  }

  // 按优先级排序的模式匹配
  const priorityPatterns = [
    // 高优先级：特定前缀的 API Key
    'openai_project_key', // 前缀更具体：sk-proj-xxx
    'openai_api_key',
    'anthropic_api_key',
    'github_pat',
    'github_oauth',
    'github_app_token',
    'stripe_secret_key',
    'stripe_publishable_key',
    'aws_access_key', // 有 AKIA 前缀，置于 aws_secret_key 之前
    'google_api_key',
    'gitlab_pat',
    'slack_token',
    'slack_webhook',
    'discord_webhook',
    'sendgrid_api_key',
    'npm_token',
    'vercel_token', // 已锚定 vercel_pat_/vercel_auth_ 前缀
    'firebase_key',
    // 中优先级：数据库连接串和 SSH 密钥
    'ssh_private_key',
    'ssl_certificate',
    'pgp_private_key',
    'postgres_uri',
    'mysql_uri',
    'mongodb_uri',
    'redis_uri',
    // 低优先级：通用格式
    'jwt_token',
    'bearer_token',
    // 兜底：易误报的宽松模式
    'aws_secret_key',
    'azure_subscription_key'
  ]

  const tryMatch = (pattern: KeyPattern): DetectionResult | null => {
    const match = text.match(pattern.pattern)
    if (!match || !match[0]) return null
    // 若 pattern 配置了上下文关键词，必须命中才算数
    if (!satisfiesContext(pattern, text)) return null
    return {
      detected: true,
      pattern,
      matchedText: match[0],
      position: {
        start: match.index || 0,
        end: (match.index || 0) + match[0].length
      },
      confidence: calculateConfidence(pattern, match[0], text)
    }
  }

  // 先按优先级尝试匹配
  for (const patternName of priorityPatterns) {
    const pattern = KEY_PATTERNS.find((p) => p.name === patternName)
    if (pattern) {
      const result = tryMatch(pattern)
      if (result) return result
    }
  }

  // 然后尝试所有其他模式
  for (const pattern of KEY_PATTERNS) {
    if (priorityPatterns.includes(pattern.name)) {
      continue // 已经检查过了
    }
    const result = tryMatch(pattern)
    if (result) return result
  }

  return { detected: false, confidence: 0 }
}

/**
 * 检测文本中的所有密钥
 * @param text 要检测的文本
 * @returns 多重检测结果
 */
export function detectAllKeys(text: string): MultiDetectionResult {
  if (!text || text.length < 10) {
    return { results: [], containsSensitive: false }
  }

  const results: DetectionResult[] = []
  const matchedRanges: { start: number; end: number }[] = []

  // 先走前缀更明确 / 更严的 pattern；留到最后的是宽松通用 pattern。
  // 避免 aws_secret_key (40 符) 把 openai_api_key (48+ 符) 的前 40 个字符切掉。
  const looseLast = new Set<string>([
    'aws_secret_key',
    'azure_subscription_key',
    'bearer_token'
  ])
  const ordered: KeyPattern[] = [
    ...KEY_PATTERNS.filter((p) => !looseLast.has(p.name)),
    ...KEY_PATTERNS.filter((p) => looseLast.has(p.name))
  ]

  for (const pattern of ordered) {
    // 上下文校验：未命中 requiresContext 的宽松 pattern 直接跳过
    if (!satisfiesContext(pattern, text)) continue

    const regex = new RegExp(pattern.pattern, 'g')
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length

      // 检查是否与已匹配的范围重叠
      const isOverlapping = matchedRanges.some(
        (range) =>
          (start >= range.start && start < range.end) || (end > range.start && end <= range.end)
      )

      if (!isOverlapping) {
        matchedRanges.push({ start, end })
        results.push({
          detected: true,
          pattern,
          matchedText: match[0],
          position: { start, end },
          confidence: calculateConfidence(pattern, match[0], text)
        })
      }
    }
  }

  // 按置信度排序
  results.sort((a, b) => b.confidence - a.confidence)

  return {
    results,
    containsSensitive: results.length > 0,
    primary: results[0]
  }
}

/**
 * 计算检测置信度
 */
function calculateConfidence(pattern: KeyPattern, matchedText: string, fullText: string): number {
  let confidence = 0.5 // 基础置信度

  // 匹配长度越长，置信度越高
  if (matchedText.length > 30) {
    confidence += 0.2
  } else if (matchedText.length > 20) {
    confidence += 0.1
  }

  // 特定前缀的密钥置信度更高
  const highConfidencePrefixes = [
    'sk-',
    'sk-ant-',
    'ghp_',
    'gho_',
    'AKIA',
    'AIza',
    'sk_test_',
    'sk_live_',
    'xox'
  ]

  for (const prefix of highConfidencePrefixes) {
    if (matchedText.startsWith(prefix)) {
      confidence += 0.2
      break
    }
  }

  // SSH 密钥和证书的置信度很高
  if (pattern.name.includes('ssh') || pattern.name.includes('certificate')) {
    confidence += 0.3
  }

  // 如果整个文本就是密钥本身，置信度更高
  if (matchedText.trim() === fullText.trim()) {
    confidence += 0.1
  }

  // 上下文分析：如果周围有相关关键词
  const contextKeywords = [
    'key',
    'token',
    'secret',
    'api',
    'password',
    'credential',
    'auth',
    '密钥',
    '令牌'
  ]

  const lowerText = fullText.toLowerCase()
  for (const keyword of contextKeywords) {
    if (lowerText.includes(keyword)) {
      confidence += 0.05
    }
  }

  return Math.min(confidence, 1.0) // 最高 1.0
}

/**
 * 快速检查文本是否可能包含敏感信息
 * @param text 要检查的文本
 * @returns 是否可能包含敏感信息
 */
export function mightContainSensitive(text: string): boolean {
  if (!text || text.length < 10) {
    return false
  }

  // 快速检查常见前缀
  const quickPatterns = [
    /sk-[a-zA-Z0-9]/,
    /ghp_[a-zA-Z0-9]/,
    /AKIA[0-9A-Z]/,
    /-----BEGIN/,
    /eyJ[a-zA-Z0-9]/,
    /(postgres|mysql|mongodb|redis):\/\//i
  ]

  for (const pattern of quickPatterns) {
    if (pattern.test(text)) {
      return true
    }
  }

  return false
}

/**
 * 获取检测结果的显示名称
 */
export function getDetectionDisplayName(result: DetectionResult): string {
  if (!result.detected || !result.pattern) {
    return '未知类型'
  }
  return result.pattern.displayName
}

/**
 * 获取检测结果的建议分类
 */
export function getSuggestedCategory(result: DetectionResult): string | undefined {
  if (!result.detected || !result.pattern) {
    return undefined
  }
  return result.pattern.provider
}
