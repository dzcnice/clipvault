/**
 * 1Password .1pux 导入步骤
 *
 * ρ2 · P0-R5：大文件（.1pux 通常 5–50MB）旧版用同步 for + btoa 处理会卡死主线程 5-15s。
 * 改用 FileReader.readAsDataURL 异步解码，避免 Electron "应用未响应" 对话框。
 */

import { useCallback, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { useImport } from '@renderer/hooks/useImport'
import { fileToBase64Async } from '@renderer/utils/file-to-base64'

export function OnepasswordStep(): JSX.Element {
  const { parse, busy, result, error, reset } = useImport()
  const [fileName, setFileName] = useState<string>('')
  const [readError, setReadError] = useState<string | null>(null)

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      reset()
      setReadError(null)
      const f = e.target.files?.[0]
      if (!f) return
      setFileName(f.name)
      try {
        const base64 = await fileToBase64Async(f)
        await parse('onepassword', base64, { base64: true })
      } catch (err) {
        setReadError(err instanceof Error ? err.message : String(err))
      }
    },
    [parse, reset]
  )

  return (
    <div className="space-y-3">
      <div>
        <Label>选择 .1pux 文件</Label>
        <input
          type="file"
          accept=".1pux,.json"
          onChange={onFile}
          className="mt-1 block w-full text-sm"
        />
        {fileName && <p className="mt-1 text-xs text-muted-foreground">{fileName}</p>}
      </div>
      {busy && <p className="text-sm">解析中...</p>}
      {readError && <p className="text-sm text-destructive">读取失败：{readError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="rounded border p-3 text-sm">
          <p>已解析 {result.items.length} 条凭证，跳过 {result.skipped}</p>
          {result.warnings.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                警告 {result.warnings.length}
              </summary>
              <ul className="mt-1 list-disc pl-4 text-xs">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          <Button size="sm" className="mt-2" data-result-commit>
            继续
          </Button>
        </div>
      )}
    </div>
  )
}
