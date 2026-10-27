// Use the installed Electron ABI for SQLite tests without launching the desktop app.
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')
const root = resolve(__dirname, '..')
const result = spawnSync(require('electron'), [
  resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...process.argv.slice(2)
], { cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit' })
if (result.error) { console.error(result.error.message); process.exitCode = 1 }
else process.exitCode = result.status ?? 1
