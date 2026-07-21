/**
 * Chrome 密码 CSV 导入步骤
 *
 * σ1 · P1-R2：Chrome 大库导出 CSV 可达几 MB，旧实现 `await f.text()` 同步阻塞主线程。
 * 改用 fileToTextAsync（FileReader 后台线程），并补 readError UI 反馈。
 */

import { useCallback, useState } from 'react'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { useImport } from '@renderer/hooks/useImport'
import { fileToTextAsync } from '@renderer/utils/file-to-base64'

export function ChromeStep(): JSX.Element {
  const { parse, busy, result, error, reset } = useImport()
  const [readError, setReadError] = useState<string | null>(null)

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      reset()
      setReadError(null)
      const f = e.target.files?.[0]
      if (!f) return
      try {
        const text = await fileToTextAsync(f)
        await parse('chrome', text)
      } catch (err) {
        setReadError((err as Error).message ?? '读取文件失败')
      }
    },
    [parse, reset]
  )

  return (
    <div className="space-y-3">
      <Label>Chrome Passwords CSV</Label>
      <Input type="file" accept=".csv" onChange={onFile} />
      {busy && <p className="text-sm">解析中...</p>}
      {readError && <p className="text-sm text-destructive">{readError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="rounded border p-3 text-sm">
          已解析 {result.items.length} 条，跳过 {result.skipped}
        </div>
      )}
    </div>
  )
}
