/**
 * 通用 CSV 列映射导入
 */

import { useCallback, useState } from 'react'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { useImport } from '@renderer/hooks/useImport'
import { fileToTextAsync } from '@renderer/utils/file-to-base64'
import type { GenericCsvMapping } from '@/types/import'

const FIELDS: Array<{ key: keyof GenericCsvMapping; label: string }> = [
  { key: 'name', label: '名称列' },
  { key: 'username', label: '用户名列' },
  { key: 'password', label: '密码列' },
  { key: 'url', label: 'URL 列' },
  { key: 'notes', label: '备注列' },
  { key: 'tags', label: '标签列' }
]

export function GenericCsvStep(): JSX.Element {
  const { parse, commit, busy, result, error, reset } = useImport()
  const [readError, setReadError] = useState<string | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [csvText, setCsvText] = useState('')
  const [mapping, setMapping] = useState<GenericCsvMapping>({})
  const [commitMsg, setCommitMsg] = useState<string | null>(null)

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      reset()
      setReadError(null)
      setCommitMsg(null)
      const f = e.target.files?.[0]
      if (!f) return
      try {
        const text = await fileToTextAsync(f)
        setCsvText(text)
        const first = text.split(/\r?\n/)[0] ?? ''
        const hs = first
          .split(',')
          .map((h) => h.replace(/^"|"$/g, '').trim())
          .filter(Boolean)
        setHeaders(hs)
        // 简单猜测
        const lower = hs.map((h) => h.toLowerCase())
        const find = (...c: string[]): string | undefined => {
          for (const x of c) {
            const i = lower.findIndex((h) => h.includes(x))
            if (i >= 0) return hs[i]
          }
          return undefined
        }
        setMapping({
          name: find('name', 'title', '名称'),
          username: find('user', 'login', 'email', '账号'),
          password: find('pass', 'secret', '密码'),
          url: find('url', 'uri', 'web', '网址'),
          notes: find('note', 'comment', '备注'),
          tags: find('tag', 'label', '标签')
        })
      } catch (err) {
        setReadError((err as Error).message ?? '读取失败')
      }
    },
    [reset]
  )

  const onParse = async (): Promise<void> => {
    if (!csvText) return
    setCommitMsg(null)
    await parse('generic-csv', csvText, { mapping })
  }

  const onCommit = async (): Promise<void> => {
    if (!result?.items?.length) return
    const r = await commit(result.items)
    if (r) {
      setCommitMsg(`已入库 ${r.count} 条，跳过 ${r.skipped}`)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        任意密码管理器导出的 CSV：先选文件，映射列名后解析入库。重复项按新增写入，导入前建议备份。
      </p>
      <Label>CSV 文件</Label>
      <Input type="file" accept=".csv,text/csv" onChange={onFile} />
      {headers.length > 0 && (
        <div className="space-y-2 rounded border p-3">
          <p className="text-xs text-muted-foreground">检测到列：{headers.join(', ')}</p>
          {FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-2">
              <Label className="w-20 shrink-0 text-xs">{f.label}</Label>
              <select
                className="h-8 flex-1 rounded border bg-background px-2 text-sm"
                value={mapping[f.key] ?? ''}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))
                }
              >
                <option value="">（跳过）</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button size="sm" disabled={busy || !csvText} onClick={() => void onParse()}>
            解析预览
          </Button>
        </div>
      )}
      {busy && <p className="text-sm">处理中…</p>}
      {readError && <p className="text-sm text-destructive">{readError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="space-y-2 rounded border p-3 text-sm">
          <p>
            已解析 {result.items.length} 条，跳过 {result.skipped}
          </p>
          {result.warnings?.length ? (
            <p className="text-xs text-muted-foreground">{result.warnings.join(' · ')}</p>
          ) : null}
          {result.items.length > 0 && (
            <Button size="sm" onClick={() => void onCommit()}>
              确认入库
            </Button>
          )}
          {commitMsg && <p className="text-xs text-green-600">{commitMsg}</p>}
        </div>
      )}
    </div>
  )
}
