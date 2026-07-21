/**
 * Bitwarden JSON 导入步骤
 *
 * σ1 · P1-R2：Bitwarden 导出 JSON 可达数 MB，旧实现 `await f.text()` 在主线程同步
 * 卡 1-3s。改用 fileToTextAsync（FileReader 后台线程）避免 UI 冻结。
 */

import { useCallback, useState } from 'react'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { useImport } from '@renderer/hooks/useImport'
import { fileToTextAsync } from '@renderer/utils/file-to-base64'

export function BitwardenStep(): JSX.Element {
  const { parse, busy, result, error, reset } = useImport()
  const [password, setPassword] = useState('')

  const [readError, setReadError] = useState<string | null>(null)

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      reset()
      setReadError(null)
      const f = e.target.files?.[0]
      if (!f) return
      // σ1 · P1-R2：改用 FileReader 异步读取，避免主线程卡顿
      try {
        const text = await fileToTextAsync(f)
        await parse('bitwarden', text, { password: password || undefined })
      } catch (err) {
        setReadError((err as Error).message ?? '读取文件失败')
      }
    },
    [parse, reset, password]
  )

  return (
    <div className="space-y-3">
      <div>
        <Label>Bitwarden 导出 JSON</Label>
        <Input type="file" accept=".json" onChange={onFile} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">加密导出密码（可选，当前不支持）</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="仅未加密 JSON 无需填写"
        />
      </div>
      {busy && <p className="text-sm">解析中...</p>}
      {readError && <p className="text-sm text-destructive">{readError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="rounded border p-3 text-sm">
          已解析 {result.items.length} 条，跳过 {result.skipped}
          <Button size="sm" className="ml-2">
            继续
          </Button>
        </div>
      )}
    </div>
  )
}
