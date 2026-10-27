// V5: actual official Host, mock model, isolated vault, no browser or real credentials.
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const root = resolve(__dirname, '../..')
const result = spawnSync(process.execPath, ['scripts/test-electron-node.cjs', 'src/main/harness-host/manager.integration.test.ts', '-t', 'utility Host'], { cwd: root, stdio: 'inherit', windowsHide: true })
process.exitCode = result.status ?? 1
