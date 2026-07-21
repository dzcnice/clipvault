/**
 * KeePass .kdbx 导入步骤（A4：落地实现）
 *
 * 后端 `parseKeepassKdbx` + IPC `sprint14:import.parse` 已接好 kdbxweb；
 * 本组件负责：
 *   1. 选择 .kdbx 文件（读为 base64 以便 IPC 透传）
 *   2. 输入主密码
 *   3. 调 useImport.parse('keepass', base64, { password, base64: true })
 *   4. 展示解析条数 / 失败原因
 */

import { useCallback, useState } from 'react'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { useImport } from '@renderer/hooks/useImport'
import { fileToBase64Async } from '@renderer/utils/file-to-base64'

export function KeepassStep(): JSX.Element {
  const { parse, commit, busy, result, error, reset } = useImport()
  const [password, setPassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [committed, setCommitted] = useState<number | null>(null)

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    reset()
    setReadError(null)
    setCommitted(null)
    const f = e.target.files?.[0] ?? null
    setFile(f)
  }, [reset])

  const onParse = useCallback(async () => {
    if (!file) {
      setReadError('请先选择 .kdbx 文件')
      return
    }
    if (!password) {
      setReadError('请输入主密码')
      return
    }
    setReadError(null)
    try {
      const b64 = await fileToBase64Async(file)
      await parse('keepass', b64, { base64: true, password })
    } catch (err) {
      setReadError((err as Error).message ?? '读取文件失败')
    }
  }, [file, password, parse])

  const onCommit = useCallback(async () => {
    if (!result) return
    const n = await commit(result.items)
    setCommitted(n)
  }, [result, commit])

  return (
    <div className="space-y-3">
      <div>
        <Label>KeePass 数据库文件 (.kdbx)</Label>
        <Input type="file" accept=".kdbx" onChange={onFile} className="mt-1" />
      </div>
      <div>
        <Label className="text-xs">主密码</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="KeePass 数据库主密码"
        />
      </div>
      <Button size="sm" onClick={onParse} disabled={busy || !file}>
        {busy ? '解析中…' : '解析 .kdbx'}
      </Button>
      {readError && <p className="text-sm text-destructive">{readError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="rounded border p-3 text-sm">
          已解析 {result.items.length} 条，跳过 {result.skipped}
          <Button size="sm" className="ml-2" onClick={onCommit} disabled={busy}>
            写入本机
          </Button>
          {committed !== null && (
            <p className="mt-2 text-xs text-muted-foreground">
              已入库 {committed} 条（import.commit 返回值）
            </p>
          )}
        </div>
      )}
    </div>
  )
}
