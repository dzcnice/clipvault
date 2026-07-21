/**
 * Onboarding · v3.1 无密码个人版
 * 欢迎 → 快捷键 → 导入
 */

export type OnboardingStepId = 'welcome' | 'shortcut' | 'import'

export interface OnboardingStepMeta {
  id: OnboardingStepId
  title: string
  description: string
  skippable: boolean
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    id: 'welcome',
    title: '欢迎使用 ClipVault',
    description: '本地剪贴板与凭证工作台。数据加密存本机，打开即用。',
    skippable: false
  },
  {
    id: 'shortcut',
    title: '快捷键',
    description: '命令面板与全局快捷键，稍后可在设置中调整。',
    skippable: true
  },
  {
    id: 'import',
    title: '导入凭证（可选）',
    description: '从 1Password / Bitwarden / Chrome / LastPass / KeePass 导入。',
    skippable: true
  }
]

export interface OnboardingState {
  currentStep: OnboardingStepId
  completedSteps: OnboardingStepId[]
  importTriggered: boolean
}

/** 步骤进度持久化 key（v3.1） */
export const ONBOARDING_STORAGE_KEY = 'clipvault:onboarding:v3.1'

/**
 * 是否完成引导的标记 key。
 * 值仍为历史 `v2` 字符串，避免已完成用户被强制重跑 onboarding。
 */
export const ONBOARDING_COMPLETED_KEY = 'clipvault:onboarded:v2'
