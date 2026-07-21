#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Windows signtool / azuresigntool 包装脚本 (TASK-084 / TASK-085)
 *
 * Usage:
 *   node scripts/sign.js <file1.exe> [file2.exe ...]
 *
 * 从环境变量读取签名凭据，调用 signtool.exe / AzureSignTool：
 *   - 本地 pfx：CSC_LINK + CSC_KEY_PASSWORD
 *   - Azure Key Vault：AZURE_KEY_VAULT_URI + AZURE_CLIENT_ID + AZURE_TENANT_ID
 *                        + AZURE_CLIENT_SECRET + AZURE_CERT_NAME
 *
 * 本文件为骨架 — 实际签名调用留待 Sprint 16 结束后验证。
 */

'use strict'

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[sign] ${msg}`)
}

function detectMode() {
  if (process.env.AZURE_KEY_VAULT_URI && process.env.AZURE_CERT_NAME) return 'azure'
  if (process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD) return 'pfx'
  return 'none'
}

function signWithPfx(files) {
  const signtool = process.env.SIGNTOOL_PATH || 'signtool.exe'
  for (const f of files) {
    const args = [
      'sign',
      '/fd',
      'sha256',
      '/td',
      'sha256',
      '/tr',
      process.env.TIMESTAMP_URL || 'http://timestamp.digicert.com',
      '/f',
      process.env.CSC_LINK,
      '/p',
      process.env.CSC_KEY_PASSWORD,
      f
    ]
    log(`signtool sign ${f}`)
    const res = spawnSync(signtool, args, { stdio: 'inherit', shell: true })
    if (res.status !== 0) throw new Error(`signtool failed for ${f}`)
  }
}

function signWithAzure(files) {
  const tool = process.env.AZURESIGNTOOL_PATH || 'AzureSignTool'
  for (const f of files) {
    const args = [
      'sign',
      '-kvu',
      process.env.AZURE_KEY_VAULT_URI,
      '-kvi',
      process.env.AZURE_CLIENT_ID,
      '-kvt',
      process.env.AZURE_TENANT_ID,
      '-kvs',
      process.env.AZURE_CLIENT_SECRET,
      '-kvc',
      process.env.AZURE_CERT_NAME,
      '-tr',
      process.env.TIMESTAMP_URL || 'http://timestamp.digicert.com',
      '-td',
      'sha256',
      '-fd',
      'sha256',
      f
    ]
    log(`AzureSignTool sign ${f}`)
    const res = spawnSync(tool, args, { stdio: 'inherit', shell: true })
    if (res.status !== 0) throw new Error(`AzureSignTool failed for ${f}`)
  }
}

function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    // eslint-disable-next-line no-console
    console.error('Usage: node sign.js <file1.exe> [file2.exe ...]')
    process.exit(1)
  }
  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`)
  }
  const mode = detectMode()
  log(`mode=${mode} (${files.length} file(s))`)
  if (mode === 'pfx') signWithPfx(files)
  else if (mode === 'azure') signWithAzure(files)
  else {
    log('⚠ 未检测到签名凭据；跳过签名（非生产发布可忽略）')
    log('   需要：CSC_LINK + CSC_KEY_PASSWORD 或 AZURE_KEY_VAULT_URI 等')
    process.exit(0)
  }
  log('✅ 签名完成')
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[sign] FAILED: ${e.message}`)
    process.exit(1)
  }
}

module.exports = { detectMode, signWithPfx, signWithAzure }
