/**
 * 密钥格式正则表达式模式库
 * KR 2.3: 智能识别与自动分类
 */

export interface KeyPattern {
  /** 类型名称 */
  name: string
  /** 显示名称 */
  displayName: string
  /** 正则表达式 */
  pattern: RegExp
  /** 描述 */
  description: string
  /** 建议的凭证类型 */
  suggestedType: string
  /** 服务提供商 */
  provider?: string
  /**
   * 上下文关键词：当 pattern 宽松时，匹配附近文本必须包含这些关键词之一才算命中。
   * 为空 / 未定义表示不做上下文校验。关键词匹配对大小写不敏感。
   */
  requiresContext?: string[]
}

/** 密钥识别模式列表 */
export const KEY_PATTERNS: KeyPattern[] = [
  // OpenAI
  {
    name: 'openai_api_key',
    displayName: 'OpenAI API Key',
    // OpenAI 历史上有多种 key 长度：经典 48+ 后缀，也见过 32+ 的短 key。
    // 放宽至 32+，以提高召回率；若前缀 "sk-" 存在，基本可以认定是 OpenAI family。
    pattern: /sk-[a-zA-Z0-9]{32,}/,
    description: 'OpenAI API 密钥',
    suggestedType: 'api_key',
    provider: 'OpenAI'
  },
  {
    name: 'openai_project_key',
    displayName: 'OpenAI Project Key',
    pattern: /sk-proj-[a-zA-Z0-9_-]{48,}/,
    description: 'OpenAI 项目密钥',
    suggestedType: 'api_key',
    provider: 'OpenAI'
  },

  // Anthropic (Claude)
  {
    name: 'anthropic_api_key',
    displayName: 'Anthropic API Key',
    pattern: /sk-ant-api[a-zA-Z0-9-]{32,}/,
    description: 'Anthropic (Claude) API 密钥',
    suggestedType: 'api_key',
    provider: 'Anthropic'
  },

  // AWS
  {
    name: 'aws_access_key',
    displayName: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/,
    description: 'AWS Access Key ID',
    suggestedType: 'api_key',
    provider: 'AWS'
  },
  {
    name: 'aws_secret_key',
    displayName: 'AWS Secret Key',
    // 必须是 40 字符，且至少包含一个字母 + 一个数字（排除 40 位纯数字 / 纯字母）。
    // 使用 \b 单词边界避免把更长的 base64 串误切一段。
    // 注意：40 字符区间内必须同时出现字母与数字，使用 lookahead 约束。
    pattern: /\b(?=[A-Za-z0-9/+=]{40}\b)(?=[A-Za-z0-9/+=]*[A-Za-z])(?=[A-Za-z0-9/+=]*\d)[A-Za-z0-9/+=]{40}\b/,
    description: 'AWS Secret Access Key（需结合上下文判断）',
    suggestedType: 'api_key',
    provider: 'AWS',
    // AWS secret 格式太泛；必须有上下文关键词才算命中，避免误报普通 40 字符 base64 / token
    requiresContext: [
      'AWS_SECRET',
      'SecretAccessKey',
      'aws-secret',
      'aws_secret',
      'secret_access_key'
    ]
  },

  // GitHub
  {
    name: 'github_pat',
    displayName: 'GitHub Personal Access Token',
    pattern: /ghp_[a-zA-Z0-9]{36}/,
    description: 'GitHub Personal Access Token',
    suggestedType: 'token',
    provider: 'GitHub'
  },
  {
    name: 'github_oauth',
    displayName: 'GitHub OAuth Token',
    pattern: /gho_[a-zA-Z0-9]{36}/,
    description: 'GitHub OAuth Access Token',
    suggestedType: 'token',
    provider: 'GitHub'
  },
  {
    name: 'github_app_token',
    displayName: 'GitHub App Token',
    pattern: /ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}/,
    description: 'GitHub App Token',
    suggestedType: 'token',
    provider: 'GitHub'
  },

  // GitLab
  {
    name: 'gitlab_pat',
    displayName: 'GitLab Personal Access Token',
    pattern: /glpat-[a-zA-Z0-9_-]{20,}/,
    description: 'GitLab Personal Access Token',
    suggestedType: 'token',
    provider: 'GitLab'
  },

  // Stripe
  {
    name: 'stripe_secret_key',
    displayName: 'Stripe Secret Key',
    pattern: /sk_(test|live)_[a-zA-Z0-9]{24,}/,
    description: 'Stripe Secret API Key',
    suggestedType: 'api_key',
    provider: 'Stripe'
  },
  {
    name: 'stripe_publishable_key',
    displayName: 'Stripe Publishable Key',
    pattern: /pk_(test|live)_[a-zA-Z0-9]{24,}/,
    description: 'Stripe Publishable API Key',
    suggestedType: 'api_key',
    provider: 'Stripe'
  },

  // Google
  {
    name: 'google_api_key',
    displayName: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    description: 'Google Cloud API Key',
    suggestedType: 'api_key',
    provider: 'Google'
  },

  // Azure
  {
    name: 'azure_subscription_key',
    displayName: 'Azure Subscription Key',
    // 32 位 hex 太通用（git SHA / UUID / MD5 都会命中），必须有明确上下文
    pattern: /(?<![a-f0-9])[a-f0-9]{32}(?![a-f0-9])/i,
    description: 'Azure 订阅密钥（32位十六进制，需上下文）',
    suggestedType: 'api_key',
    provider: 'Azure',
    requiresContext: [
      'Ocp-Apim-Subscription-Key',
      'Ocp-Apim',
      'subscription-key',
      'SubscriptionKey',
      'azure_subscription',
      'AzureSubscriptionKey'
    ]
  },

  // JWT Token
  {
    name: 'jwt_token',
    displayName: 'JWT Token',
    pattern: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    description: 'JSON Web Token',
    suggestedType: 'token'
  },

  // Bearer Token
  {
    name: 'bearer_token',
    displayName: 'Bearer Token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]+/i,
    description: 'HTTP Bearer Token',
    suggestedType: 'token'
  },

  // SSH Private Key
  {
    name: 'ssh_private_key',
    displayName: 'SSH Private Key',
    pattern: /-----BEGIN (RSA |OPENSSH |DSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
    description: 'SSH 私钥',
    suggestedType: 'ssh_key'
  },

  // SSL Certificate
  {
    name: 'ssl_certificate',
    displayName: 'SSL Certificate',
    pattern: /-----BEGIN CERTIFICATE-----/,
    description: 'SSL/TLS 证书',
    suggestedType: 'certificate'
  },

  // PGP Key
  {
    name: 'pgp_private_key',
    displayName: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
    description: 'PGP 私钥',
    suggestedType: 'ssh_key'
  },

  // Database Connection Strings
  {
    name: 'postgres_uri',
    displayName: 'PostgreSQL Connection',
    pattern: /postgres(ql)?:\/\/[^\s]+/i,
    description: 'PostgreSQL 连接字符串',
    suggestedType: 'database'
  },
  {
    name: 'mysql_uri',
    displayName: 'MySQL Connection',
    pattern: /mysql:\/\/[^\s]+/i,
    description: 'MySQL 连接字符串',
    suggestedType: 'database'
  },
  {
    name: 'mongodb_uri',
    displayName: 'MongoDB Connection',
    pattern: /mongodb(\+srv)?:\/\/[^\s]+/i,
    description: 'MongoDB 连接字符串',
    suggestedType: 'database'
  },
  {
    name: 'redis_uri',
    displayName: 'Redis Connection',
    pattern: /redis(s)?:\/\/[^\s]+/i,
    description: 'Redis 连接字符串',
    suggestedType: 'database'
  },

  // Slack
  {
    name: 'slack_token',
    displayName: 'Slack Token',
    pattern: /xox[baprs]-[0-9a-zA-Z-]+/,
    description: 'Slack API Token',
    suggestedType: 'token',
    provider: 'Slack'
  },
  {
    name: 'slack_webhook',
    displayName: 'Slack Webhook',
    pattern: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]+/,
    description: 'Slack Webhook URL',
    suggestedType: 'api_key',
    provider: 'Slack'
  },

  // Discord
  {
    name: 'discord_token',
    displayName: 'Discord Token',
    pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/,
    description: 'Discord Bot Token',
    suggestedType: 'token',
    provider: 'Discord'
  },
  {
    name: 'discord_webhook',
    displayName: 'Discord Webhook',
    pattern: /https:\/\/discord(app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+/,
    description: 'Discord Webhook URL',
    suggestedType: 'api_key',
    provider: 'Discord'
  },

  // Telegram
  {
    name: 'telegram_bot_token',
    displayName: 'Telegram Bot Token',
    pattern: /[0-9]{8,10}:[a-zA-Z0-9_-]{35}/,
    description: 'Telegram Bot API Token',
    suggestedType: 'token',
    provider: 'Telegram'
  },

  // Twilio
  {
    name: 'twilio_api_key',
    displayName: 'Twilio API Key',
    pattern: /SK[a-f0-9]{32}/,
    description: 'Twilio API Key',
    suggestedType: 'api_key',
    provider: 'Twilio'
  },

  // SendGrid
  {
    name: 'sendgrid_api_key',
    displayName: 'SendGrid API Key',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/,
    description: 'SendGrid API Key',
    suggestedType: 'api_key',
    provider: 'SendGrid'
  },

  // Mailgun
  {
    name: 'mailgun_api_key',
    displayName: 'Mailgun API Key',
    pattern: /key-[a-zA-Z0-9]{32}/,
    description: 'Mailgun API Key',
    suggestedType: 'api_key',
    provider: 'Mailgun'
  },

  // npm
  {
    name: 'npm_token',
    displayName: 'npm Token',
    pattern: /npm_[a-zA-Z0-9]{36}/,
    description: 'npm Access Token',
    suggestedType: 'token',
    provider: 'npm'
  },

  // Heroku
  {
    name: 'heroku_api_key',
    displayName: 'Heroku API Key',
    pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i,
    description: 'Heroku API Key (UUID 格式)',
    suggestedType: 'api_key',
    provider: 'Heroku'
  },

  // Vercel
  {
    name: 'vercel_token',
    displayName: 'Vercel Token',
    // 只识别明确带 vercel_ 前缀的；旧的 24 字符纯字母数字过于宽泛
    pattern: /\bvercel_(?:pat|auth)_[A-Za-z0-9]{24,}\b/,
    description: 'Vercel Access Token（带 vercel_pat_/vercel_auth_ 前缀）',
    suggestedType: 'token',
    provider: 'Vercel'
  },

  // Supabase
  {
    name: 'supabase_key',
    displayName: 'Supabase Key',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
    description: 'Supabase API Key (JWT 格式)',
    suggestedType: 'api_key',
    provider: 'Supabase'
  },

  // Firebase
  {
    name: 'firebase_key',
    displayName: 'Firebase Key',
    pattern: /AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}/,
    description: 'Firebase Cloud Messaging Key',
    suggestedType: 'api_key',
    provider: 'Firebase'
  }
]

/** 根据类型名获取模式 */
export function getPatternByName(name: string): KeyPattern | undefined {
  return KEY_PATTERNS.find((p) => p.name === name)
}

/** 根据提供商获取所有模式 */
export function getPatternsByProvider(provider: string): KeyPattern[] {
  return KEY_PATTERNS.filter((p) => p.provider === provider)
}

/** 获取所有提供商列表 */
export function getAllProviders(): string[] {
  const providers = new Set<string>()
  for (const pattern of KEY_PATTERNS) {
    if (pattern.provider) {
      providers.add(pattern.provider)
    }
  }
  return Array.from(providers).sort()
}
