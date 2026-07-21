/**
 * ThemeToggle：三态主题切换控件
 *
 * 视觉：玻璃风格 segmented control（system / light / dark）
 * 切换时通过全局 fade（tokens.css 的 html * transition）做平滑过渡。
 */

import { useTranslation } from 'react-i18next'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeMode } from '@renderer/hooks/useTheme'
import { cn } from '@renderer/lib/utils'

interface ThemeToggleProps {
  className?: string
}

export default function ThemeToggle({ className }: ThemeToggleProps): JSX.Element {
  const { t } = useTranslation('settings')
  const { mode, setMode } = useTheme()

  const items: Array<{ value: ThemeMode; icon: JSX.Element; label: string }> = [
    { value: 'system', icon: <Monitor className="h-4 w-4" />, label: t('theme_system') },
    { value: 'light', icon: <Sun className="h-4 w-4" />, label: t('theme_light') },
    { value: 'dark', icon: <Moon className="h-4 w-4" />, label: t('theme_dark') }
  ]

  return (
    <div
      role="radiogroup"
      aria-label={t('theme')}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-white/30 bg-white/20 p-1 backdrop-blur',
        className
      )}
    >
      {items.map((item) => {
        const active = mode === item.value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={item.label}
            title={item.label}
            onClick={() => setMode(item.value)}
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all',
              active
                ? 'bg-white/60 text-foreground shadow-sm'
                : 'text-foreground/70 hover:bg-white/30'
            )}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
