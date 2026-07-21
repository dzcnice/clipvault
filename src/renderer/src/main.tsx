import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import HUDRoot from './hud/HUDRoot'
import ErrorBoundary from './components/ErrorBoundary'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import { PromptDialogProvider } from './components/PromptDialog'
import './styles/tokens.css'
import './styles/index.css'
import './i18n'

const isHUD =
  typeof window !== 'undefined' &&
  (window.location.hash === '#hud' || window.location.hash.startsWith('#hud'))

// 像素保险库：默认浅色
;(function applyInitialTheme(): void {
  try {
    const stored = window.localStorage.getItem('clipvault.theme.mode')
    const mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'light'
    const prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    const resolved = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.colorScheme = resolved
  } catch {
    document.documentElement.setAttribute('data-theme', 'light')
  }
})()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isHUD ? (
        <HUDRoot />
      ) : (
        <ConfirmDialogProvider>
          <PromptDialogProvider>
            <App />
          </PromptDialogProvider>
        </ConfirmDialogProvider>
      )}
    </ErrorBoundary>
  </React.StrictMode>
)
