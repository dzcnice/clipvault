#!/usr/bin/env node
/**
 * ClipVault v3 安全扫描骨架
 *
 * 对应 SECURITY.md 威胁 T1–T8。不执行攻击性操作。
 *   node scripts/security-scan.js [--check=t1|all]
 */

/* eslint-disable no-console */

const checks = [
  {
    id: 'T1',
    name: '物理拿走已登录本机',
    severity: 'medium',
    run: async () => ({
      status: 'accepted',
      note: '无日常主密码；依赖 OS 登录。可选 DPAPI/Touch ID 作敏感操作确认'
    })
  },
  {
    id: 'T2',
    name: '同机异用户读 SQLite',
    severity: 'high',
    run: async () => ({
      status: 'skipped',
      note: '凭证 AES-256-GCM + DEK；AppData 受 OS 用户 ACL 隔离'
    })
  },
  {
    id: 'T3',
    name: '离线硬抠 DEK 包装',
    severity: 'medium',
    run: async () => ({
      status: 'skipped',
      note: 'DEK 由 safeStorage（DPAPI / Keychain / libsecret）包装'
    })
  },
  {
    id: 'T4',
    name: 'SQL 注入',
    severity: 'high',
    run: async () => ({
      status: 'skipped',
      note: 'better-sqlite3 参数化 + 排序字段白名单'
    })
  },
  {
    id: 'T5',
    name: '导出文件泄露',
    severity: 'medium',
    run: async () => ({
      status: 'skipped',
      note: '默认脱敏；加密导出 scrypt + AES-256-GCM'
    })
  },
  {
    id: 'T6',
    name: '伪造 IPC',
    severity: 'high',
    run: async () => ({
      status: 'skipped',
      note: 'wrapHandler：webContents id 白名单 + URL 前缀；无 P2P/HTTP API'
    })
  },
  {
    id: 'T7',
    name: '渲染进程 XSS',
    severity: 'medium',
    run: async () => ({
      status: 'skipped',
      note: 'CSP + contextIsolation + sandbox'
    })
  },
  {
    id: 'T8',
    name: '屏幕录制 / 截图',
    severity: 'low',
    run: async () => ({
      status: 'skipped',
      note: '敏感页可 setContentProtection；无法对抗物理拍摄'
    })
  }
]

async function main() {
  const arg = process.argv.slice(2).find((a) => a.startsWith('--check='))
  const selector = arg ? arg.split('=')[1] : 'all'
  const selected =
    selector === 'all' ? checks : checks.filter((c) => c.id.toLowerCase() === selector.toLowerCase())

  console.log(`[security-scan] ClipVault v3 · ${selected.length} 项（骨架）\n`)

  const results = []
  for (const check of selected) {
    const res = await check.run()
    results.push({ ...check, ...res })
    console.log(`  [${check.id}] ${check.name}`)
    console.log(`      ${res.status}: ${res.note}\n`)
  }

  const failed = results.filter((r) => r.status === 'fail')
  process.exit(failed.length ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
