/**
 * 导入向导页（TASK-074 / 075）
 *
 * 单页 tab 切换；每个 tab 一个 *Step 子组件自行处理解析结果。
 */

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { OnepasswordStep } from '@renderer/components/import/OnepasswordStep'
import { BitwardenStep } from '@renderer/components/import/BitwardenStep'
import { KeepassStep } from '@renderer/components/import/KeepassStep'
import { ChromeStep } from '@renderer/components/import/ChromeStep'
import { LastpassStep } from '@renderer/components/import/LastpassStep'

type Tab = 'onepassword' | 'bitwarden' | 'chrome' | 'lastpass' | 'keepass'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'onepassword', label: '1Password (.1pux)' },
  { key: 'bitwarden', label: 'Bitwarden (JSON)' },
  { key: 'chrome', label: 'Chrome (CSV)' },
  { key: 'lastpass', label: 'LastPass (CSV)' },
  { key: 'keepass', label: 'KeePass (.kdbx)' }
]

const VALID_TABS: readonly Tab[] = ['onepassword', 'bitwarden', 'chrome', 'lastpass', 'keepass']

export function ImportWizard(): JSX.Element {
  const location = useLocation()
  // A3：支持 #/import?source=xxx 初始切 Tab（lazy init，避免 effect 内同步 setState）
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(location.search)
    const src = params.get('source') as Tab | null
    if (src && (VALID_TABS as readonly string[]).includes(src)) {
      return src
    }
    return 'onepassword'
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header>
        <h1 className="text-xl font-semibold">从第三方密码管理器导入</h1>
        <p className="text-sm text-muted-foreground">
          支持 1Password / Bitwarden / Chrome / LastPass。导入的数据经 DEK 加密后落库。
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm ${
              tab === t.key
                ? 'border-b-2 border-primary font-medium'
                : 'text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section>
        {tab === 'onepassword' && <OnepasswordStep />}
        {tab === 'bitwarden' && <BitwardenStep />}
        {tab === 'chrome' && <ChromeStep />}
        {tab === 'lastpass' && <LastpassStep />}
        {tab === 'keepass' && <KeepassStep />}
      </section>
    </div>
  )
}
