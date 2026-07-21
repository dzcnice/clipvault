/**
 * useLanguage：读取 / 切换当前语言
 *
 * v2 Sprint 1 默认不暴露切换 UI；测试时通过 URL `?lang=en` 即可触发。
 */

import { useTranslation } from 'react-i18next'
import type { SupportedLanguage } from '@renderer/i18n'

export interface UseLanguage {
  language: SupportedLanguage
  setLanguage: (lang: SupportedLanguage) => void
}

export function useLanguage(): UseLanguage {
  const { i18n } = useTranslation()
  return {
    language: (i18n.language as SupportedLanguage) || 'zh-CN',
    setLanguage: (lang) => {
      void i18n.changeLanguage(lang)
    }
  }
}
