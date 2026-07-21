#!/usr/bin/env node
/**
 * 用 Electron ABI 编译 better-sqlite3。
 *
 * 策略：
 *   1. 删除 node_modules/better-sqlite3/build/
 *   2. 直接调用 `npm install` 并设 env：
 *      - npm_config_build_from_source=true（禁用 prebuilt）
 *      - npm_config_runtime=electron
 *      - npm_config_target=<electronVersion>
 *      - npm_config_disturl=https://electronjs.org/headers
 *   3. npm 会重新走 install script（prebuild-install || node-gyp rebuild）
 *      因为 build_from_source=true，prebuild-install 会立刻失败、fallback 到 node-gyp
 *      node-gyp 会看到 disturl/target，从 Electron headers 编译
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const pkg = require('../package.json')

const electronVersion = (pkg.devDependencies?.electron ?? '37.10.3').replace(/^\^|~/, '')
console.log(`[rebuild-electron] target electron=${electronVersion}`)

// 1. 删 build/ + .node 以强制重编
const buildDir = path.join(
  __dirname,
  '..',
  'node_modules',
  'better-sqlite3',
  'build'
)
try {
  fs.rmSync(buildDir, { recursive: true, force: true })
  console.log('[rebuild-electron] removed build/')
} catch (err) {
  console.warn('[rebuild-electron] failed to remove build/:', err.message)
}

// 2. 构造 env —— 注意 npm_config_* 会被 npm 识别
const env = {
  ...process.env,
  npm_config_build_from_source: 'true',
  npm_config_runtime: 'electron',
  npm_config_target: electronVersion,
  npm_config_disturl: 'https://electronjs.org/headers',
  // 关键：npm install / rebuild 会忽略外层 npm_config_*，除非 --foreground-scripts
  npm_config_foreground_scripts: 'true'
}

// 3. 先 rebuild；这一步会跑 install script。
//    使用 --ignore-scripts=false（触发 install）但避免 top-level postinstall。
//    npm 没有直接办法仅跳过 postinstall，所以我们用两步：
//    a. npm rebuild better-sqlite3 --foreground-scripts（编译）
//    b. 最后检验 .node 时间戳（若被 electron-builder 覆盖，手动补救）
console.log('[rebuild-electron] running npm rebuild better-sqlite3 --foreground-scripts ...')
const res = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'rebuild',
    'better-sqlite3',
    '--foreground-scripts',
    '--verbose'
  ],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32'
  }
)

if (res.status !== 0) {
  process.exit(res.status ?? 1)
}

// 4. 校验：查看 .node 是否包含 Electron v37 headers 特征
const nodePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
)
if (fs.existsSync(nodePath)) {
  const st = fs.statSync(nodePath)
  console.log(`[rebuild-electron] .node size=${st.size} mtime=${st.mtime.toISOString()}`)
}
console.log('[rebuild-electron] done')
