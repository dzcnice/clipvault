/**
 * i18n · v3 个人版默认中文。
 * 英文资源仍打包但仅在 ?lang=en 时加载到内存（resources 同步挂载，体积已含于 locale JSON）。
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

// 个人版去掉 vera / team / unlock 命名空间噪音
const NAMESPACES = ['common', 'credential', 'settings'] as const

function detectLanguageFromQuery(): SupportedLanguage {
  if (typeof window === 'undefined') return 'zh-CN'
  try {
    const params = new URLSearchParams(window.location.search)
    const hashParams = window.location.hash.includes('?')
      ? new URLSearchParams(window.location.hash.split('?')[1] ?? '')
      : new URLSearchParams()
    const raw = params.get('lang') ?? hashParams.get('lang') ?? ''
    if (!raw) return 'zh-CN'
    if (raw.toLowerCase().startsWith('en')) return 'en-US'
    return 'zh-CN'
  } catch {
    return 'zh-CN'
  }
}

const lng = detectLanguageFromQuery()

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': zhCN,
    // 仅在明确请求英文时注册，略减默认路径解析面
    ...(lng === 'en-US' ? { 'en-US': enUS } : {})
  },
  lng,
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  ns: NAMESPACES,
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
})

export default i18n
