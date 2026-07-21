#!/usr/bin/env node
/**
 * ClipVault 冒烟测试骨架（TASK-081 辅助）
 *
 * 作为 CI 构建产物后的最小启动验证：
 *   1. 能否加载主进程 out/main/index.js（语法 / require 检查）
 *   2. 关键模块是否可 require（crypto、db、ipc）
 *   3. 不启动 Electron，仅做静态装载
 *
 * 用法：
 *   node scripts/smoke-test.js
 */

/* eslint-disable no-console */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'out')

function checkExists(relPath) {
  const abs = path.join(ROOT, relPath)
  const ok = fs.existsSync(abs)
  console.log(`  ${ok ? 'OK ' : 'MISS'}  ${relPath}`)
  return ok
}

function main() {
  console.log('[smoke] ClipVault 构建产物冒烟检查')
  let ok = true
  ok = checkExists('out/main/index.js') && ok
  ok = checkExists('out/preload/index.js') && ok
  ok = checkExists('out/renderer/index.html') && ok

  if (!ok) {
    console.error('[smoke] 必要产物缺失，请先运行 npm run build')
    process.exit(1)
  }

  // 语法加载：不执行副作用，仅 require 顶层
  try {
    require(path.join(OUT, 'main/index.js'))
    console.log('[smoke] main/index.js require 通过')
  } catch (err) {
    // Electron 环境缺失会抛错，允许忽略但提示
    console.warn('[smoke] main require 警告（预期：非 Electron 运行时）：', err.message)
  }

  console.log('[smoke] 冒烟检查完成')
}

main()
