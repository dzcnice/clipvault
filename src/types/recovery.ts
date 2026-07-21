/**
 * Sprint 13 / TASK-071 BIP39 24 词恢复短语类型
 */

export type RecoveryVerifyMode = 'sequence' | 'pick' | 'fill'

export interface RecoveryPhraseSetupResult {
  success: boolean
  /** 24 个词，明文仅一次返回给 UI 做抄录，不落库 */
  mnemonic: string[]
  error?: string
}

export interface RecoveryVerifyChallenge {
  mode: RecoveryVerifyMode
  /** pick 模式：48 词池（含正确 24 + 干扰 24） */
  pool?: string[]
  /** fill 模式：5-8 个空位的索引（0-based） */
  blanks?: number[]
  /** fill 模式：带 ___ 占位的 24 词（供 UI 展示上下文） */
  masked?: string[]
}

export interface RecoveryVerifyInput {
  mode: RecoveryVerifyMode
  /** sequence：顺序提交 24 词；pick：按正确顺序点选后的词数组；fill：补全后的完整 24 词 */
  words: string[]
}

export interface RecoveryStatus {
  enrolled: boolean
  /** 上次成功验证（ms） */
  lastVerifiedAt: number | null
}

export interface RecoveryResetResult {
  success: boolean
  error?: string
}

export const RECOVERY_CHANNELS = {
  STATUS: 'sprint13:recovery-status',
  SETUP: 'sprint13:recovery-setup',
  CHALLENGE: 'sprint13:recovery-challenge',
  VERIFY: 'sprint13:recovery-verify',
  RESET_PASSWORD: 'sprint13:recovery-reset-password',
  DISABLE: 'sprint13:recovery-disable'
} as const
