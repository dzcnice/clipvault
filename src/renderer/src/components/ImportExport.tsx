/**
 * 导入导出组件 - 液态玻璃风格
 */

import { useState, useRef } from 'react'

const DownloadIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
)

const UploadIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)

const FileIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
)

const CheckIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
)

const AlertIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
  </svg>
)

interface ImportExportProps {
  onExport: (options: ExportOptions) => Promise<void>
  // 导入改为不带参数：主进程 dialog 自己处理文件选择
  // 保留 file?:File 便于未来扩展，但目前实现只调用 onImport()
  onImport: (file?: File) => Promise<ImportResult>
}

interface ExportOptions {
  format: 'json' | 'csv'
  includeCredentials: boolean
  includeClipboard: boolean
  includeCategories: boolean
  /** A-1：JSON 子模式；'plain' 为脱敏导出，'encrypted' 为带密码加密 */
  jsonMode?: 'plain' | 'encrypted'
  /** A-1：加密导出密码 */
  exportPassword?: string
}

interface ImportResult {
  success: boolean
  message: string
  stats?: {
    credentials?: { total: number; imported: number; skipped: number }
    clipboardItems?: { total: number; imported: number; skipped: number }
    categories?: { total: number; imported: number; skipped: number }
  }
}

export default function ImportExport({
  onExport,
  onImport
}: ImportExportProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export')
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json')
  // 默认推荐加密导出（P1）
  const [jsonMode, setJsonMode] = useState<'plain' | 'encrypted'>('encrypted')
  const [exportPassword, setExportPassword] = useState('')
  const [exportOptions, setExportOptions] = useState({
    includeCredentials: true,
    includeClipboard: true,
    includeCategories: true
  })
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async (): Promise<void> => {
    setExportError(null)
    // A-1：加密模式下密码必须 ≥ 4 字符（与主进程 toEncryptedExport 的约束保持一致）
    if (exportFormat === 'json' && jsonMode === 'encrypted' && exportPassword.length < 4) {
      setExportError('加密导出需要至少 4 个字符的导出密码')
      return
    }
    setIsExporting(true)
    try {
      await onExport({
        format: exportFormat,
        ...exportOptions,
        jsonMode: exportFormat === 'json' ? jsonMode : undefined,
        exportPassword:
          exportFormat === 'json' && jsonMode === 'encrypted' ? exportPassword : undefined
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (file?: File): Promise<void> => {
    setIsImporting(true)
    setImportResult(null)
    try {
      const result = await onImport(file)
      setImportResult(result)
    } catch (error) {
      setImportResult({
        success: false,
        message: error instanceof Error ? error.message : '导入失败'
      })
    } finally {
      setIsImporting(false)
    }
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  // 点击"选择文件"整个区域时，直接触发主进程 dialog（无需走本地 File API）
  const handlePickViaDialog = (): void => {
    handleFileSelect(undefined)
  }

  return (
    <div className="glass-card p-6">
      {/* 标签切换 */}
      <div className="flex gap-2 mb-6">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            activeTab === 'export' ? 'glass-btn-primary' : 'glass-btn'
          }`}
          onClick={() => setActiveTab('export')}
        >
          <DownloadIcon />
          导出数据
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            activeTab === 'import' ? 'glass-btn-primary' : 'glass-btn'
          }`}
          onClick={() => setActiveTab('import')}
        >
          <UploadIcon />
          导入数据
        </button>
      </div>

      {/* 导出面板 */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          {/* 格式选择 */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              导出格式
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={exportFormat === 'json'}
                  onChange={() => setExportFormat('json')}
                  className="accent-[var(--morandi-green)]"
                />
                <span style={{ color: 'var(--text-primary)' }}>JSON</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  (完整数据，支持重新导入)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={exportFormat === 'csv'}
                  onChange={() => setExportFormat('csv')}
                  className="accent-[var(--morandi-green)]"
                />
                <span style={{ color: 'var(--text-primary)' }}>CSV</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  (表格格式，便于查看)
                </span>
              </label>
            </div>
          </div>

          {/* JSON 子模式（仅 JSON 格式显示） */}
          {exportFormat === 'json' && (
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                JSON 凭证处理
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="jsonMode"
                    checked={jsonMode === 'plain'}
                    onChange={() => setJsonMode('plain')}
                    className="accent-[var(--morandi-green)]"
                  />
                  <span style={{ color: 'var(--text-primary)' }}>纯 JSON（脱敏）</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    凭证 value 被置空；适合结构分析/备份元数据
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="jsonMode"
                    checked={jsonMode === 'encrypted'}
                    onChange={() => setJsonMode('encrypted')}
                    className="accent-[var(--morandi-green)]"
                  />
                  <span style={{ color: 'var(--text-primary)' }}>加密 JSON</span>
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    使用独立导出密码 AES-256-GCM 加密
                  </span>
                </label>
              </div>
              {jsonMode === 'encrypted' && (
                <div className="mt-3">
                  <label
                    htmlFor="export-password"
                    className="block text-sm mb-1"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    导出密码（独立于主密码）
                  </label>
                  <input
                    id="export-password"
                    type="password"
                    className="glass-input"
                    value={exportPassword}
                    placeholder="至少 4 个字符"
                    onChange={(e) => setExportPassword(e.target.value)}
                    aria-label="导出密码"
                  />
                </div>
              )}
            </div>
          )}

          {/* 导出内容选择 */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              导出内容
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeCredentials}
                  onChange={(e) => setExportOptions({ ...exportOptions, includeCredentials: e.target.checked })}
                  className="accent-[var(--morandi-green)]"
                />
                <span style={{ color: 'var(--text-primary)' }}>密钥数据</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeClipboard}
                  onChange={(e) => setExportOptions({ ...exportOptions, includeClipboard: e.target.checked })}
                  className="accent-[var(--morandi-green)]"
                />
                <span style={{ color: 'var(--text-primary)' }}>剪贴板历史</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportOptions.includeCategories}
                  onChange={(e) => setExportOptions({ ...exportOptions, includeCategories: e.target.checked })}
                  className="accent-[var(--morandi-green)]"
                />
                <span style={{ color: 'var(--text-primary)' }}>分类数据</span>
              </label>
            </div>
          </div>

          {exportError && (
            <p className="text-sm" style={{ color: '#dc6464' }} role="alert">
              {exportError}
            </p>
          )}

          {/* 导出按钮 */}
          <button
            className="glass-btn glass-btn-primary w-full py-3 flex items-center justify-center gap-2"
            onClick={handleExport}
            disabled={isExporting || (!exportOptions.includeCredentials && !exportOptions.includeClipboard && !exportOptions.includeCategories)}
            aria-label="导出数据"
          >
            {isExporting ? (
              <>
                <span className="animate-spin">⏳</span>
                导出中...
              </>
            ) : (
              <>
                <DownloadIcon />
                导出数据
              </>
            )}
          </button>
        </div>
      )}

      {/* 导入面板 */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* 拖放区域 */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              dragOver ? 'border-[var(--morandi-green)] bg-[var(--morandi-green)]/10' : ''
            }`}
            style={{ borderColor: dragOver ? 'var(--morandi-green)' : 'var(--glass-border)' }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={handlePickViaDialog}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <div className="flex flex-col items-center gap-3">
              <span
                className="p-4 rounded-full"
                style={{ background: 'rgba(134, 167, 124, 0.2)', color: 'var(--morandi-green-dark)' }}
              >
                <FileIcon />
              </span>
              <div>
                <p style={{ color: 'var(--text-primary)' }}>
                  拖放文件到此处，或点击选择文件
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  支持 JSON 和 CSV 格式
                </p>
              </div>
            </div>
          </div>

          {/* 导入中状态 */}
          {isImporting && (
            <div className="flex items-center justify-center gap-2 py-4" style={{ color: 'var(--text-secondary)' }}>
              <span className="animate-spin">⏳</span>
              导入中...
            </div>
          )}

          {/* 导入结果 */}
          {importResult && (
            <div
              className={`p-4 rounded-lg ${
                importResult.success ? 'bg-green-500/10' : 'bg-red-500/10'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {importResult.success ? (
                  <span style={{ color: 'var(--morandi-green)' }}>
                    <CheckIcon />
                  </span>
                ) : (
                  <span style={{ color: 'var(--morandi-pink)' }}>
                    <AlertIcon />
                  </span>
                )}
                <span
                  className="font-medium"
                  style={{ color: importResult.success ? 'var(--morandi-green)' : 'var(--morandi-pink)' }}
                >
                  {importResult.success ? '导入成功' : '导入失败'}
                </span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {importResult.message}
              </p>
              {importResult.stats && (
                <div className="mt-3 space-y-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  {importResult.stats.credentials && (
                    <p>
                      密钥: 导入 {importResult.stats.credentials.imported} /
                      跳过 {importResult.stats.credentials.skipped} /
                      共 {importResult.stats.credentials.total}
                    </p>
                  )}
                  {importResult.stats.clipboardItems && (
                    <p>
                      剪贴板: 导入 {importResult.stats.clipboardItems.imported} /
                      跳过 {importResult.stats.clipboardItems.skipped} /
                      共 {importResult.stats.clipboardItems.total}
                    </p>
                  )}
                  {importResult.stats.categories && (
                    <p>
                      分类: 导入 {importResult.stats.categories.imported} /
                      跳过 {importResult.stats.categories.skipped} /
                      共 {importResult.stats.categories.total}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 注意事项 */}
          <div
            className="p-4 rounded-lg"
            style={{ background: 'rgba(167, 196, 188, 0.1)' }}
          >
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--morandi-blue)' }}>
              导入说明
            </p>
            <ul className="text-sm space-y-1" style={{ color: 'var(--text-tertiary)' }}>
              <li>• JSON 格式需要是 ClipVault 导出的标准格式</li>
              <li>• CSV 格式需要包含正确的列头</li>
              <li>• 重复的数据将被跳过</li>
              <li>• 导入前建议先备份现有数据</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
