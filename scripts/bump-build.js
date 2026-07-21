#!/usr/bin/env node
/**
 * 版本号构建编号 bumper
 *
 * 作用：每次打包前自动 ++ package.json 的 version 后缀 build 数字。
 * 例：2.1.0-b1 → 2.1.0-b2 → 2.1.0-b3 ...
 *
 * 同步更新 package-lock.json 的两处 version 字段，保证 lock 一致。
 *
 * 调用：node scripts/bump-build.js
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')

function parseAndBump(version) {
  const m = version.match(/^(\d+\.\d+\.\d+)-b(\d+)$/)
  if (!m) {
    // 没带 -bN 后缀就从 b1 开始
    return `${version}-b1`
  }
  const base = m[1]
  const next = Number(m[2]) + 1
  return `${base}-b${next}`
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const oldVersion = pkg.version
const newVersion = parseAndBump(oldVersion)
pkg.version = newVersion
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

// 同步 package-lock.json 的两处 version
if (fs.existsSync(lockPath)) {
  const lockRaw = fs.readFileSync(lockPath, 'utf8')
  const lock = JSON.parse(lockRaw)
  if (lock.version) lock.version = newVersion
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = newVersion
  }
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8')
}

console.log(`[bump-build] ${oldVersion} → ${newVersion}`)
