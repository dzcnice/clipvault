#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * ClipVault release pipeline.
 *
 * Usage:
 *   node scripts/release.js
 *   node scripts/release.js --channel=beta --dry-run
 *   node scripts/release.js --skip-build --skip-tests --skip-publish
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { detectMode } = require('./sign')
const { findInstaller } = require('./smoke-installer')

const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md')
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json')
const BUILDER_CONFIG_PATH = path.join(ROOT, 'electron-builder.yml')

function parseArgs(argv) {
  return {
    channel: readOption(argv, '--channel=') || 'stable',
    dryRun: argv.includes('--dry-run'),
    skipBuild: argv.includes('--skip-build'),
    skipTests: argv.includes('--skip-tests'),
    skipPublish: argv.includes('--skip-publish'),
    skipSmoke: argv.includes('--skip-smoke'),
    skipSign: argv.includes('--skip-sign')
  }
}

function readOption(argv, prefix) {
  const raw = argv.find((arg) => arg.startsWith(prefix))
  return raw ? raw.slice(prefix.length) : ''
}

function log(step, message) {
  const ts = new Date().toISOString()
  // eslint-disable-next-line no-console
  console.log(`[release ${ts}] [${step}] ${message}`)
}

function run(command, args, options = {}) {
  log('exec', `${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  })
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim()
  }
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? ['where', command] : ['which', command]
  const result = capture(probe[0], [probe[1]])
  return result.status === 0
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'))
}

function parseBuilderRepo() {
  const raw = fs.readFileSync(BUILDER_CONFIG_PATH, 'utf8')
  const owner = raw.match(/^\s*owner:\s*(.+)\s*$/m)?.[1]?.trim()
  const repo = raw.match(/^\s*repo:\s*(.+)\s*$/m)?.[1]?.trim()
  return owner && repo ? `${owner}/${repo}` : null
}

function isGitRepo() {
  return capture('git', ['rev-parse', '--is-inside-work-tree']).status === 0
}

function getGitBranch() {
  return capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout
}

function getGitStatus() {
  return capture('git', ['status', '--porcelain']).stdout
}

function ensureVersionInChangelog(version) {
  const raw = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  if (!raw.includes(version)) {
    throw new Error(`CHANGELOG.md does not mention package version ${version}`)
  }
}

function listReleaseAssets(version) {
  if (!fs.existsSync(DIST_DIR)) {
    return []
  }
  const files = fs
    .readdirSync(DIST_DIR)
    .map((name) => path.join(DIST_DIR, name))
    .filter((filePath) => fs.statSync(filePath).isFile())

  if (process.platform === 'win32') {
    return files.filter((filePath) => {
      const name = path.basename(filePath)
      return (
        name === 'latest.yml' ||
        name === `${readPackageJson().name}-${version}-setup.exe` ||
        name === `${readPackageJson().name}-${version}-setup.exe.blockmap`
      )
    })
  }

  if (process.platform === 'darwin') {
    return files.filter((filePath) => /\.(dmg|zip|blockmap|ya?ml)$/i.test(filePath))
  }

  return files.filter((filePath) => /\.(AppImage|deb|snap|blockmap|ya?ml)$/i.test(filePath))
}

function listWindowsSignTargets(version) {
  const targets = []
  const setupExe = path.join(DIST_DIR, `${readPackageJson().name}-${version}-setup.exe`)
  const unpackedExe = path.join(DIST_DIR, 'win-unpacked', 'ClipVault.exe')
  if (fs.existsSync(setupExe)) targets.push(setupExe)
  if (fs.existsSync(unpackedExe)) targets.push(unpackedExe)
  return targets
}

function releaseTag(version) {
  return `v${version}`
}

function preflight(args) {
  const pkg = readPackageJson()
  const version = pkg.version
  const repo = parseBuilderRepo()

  if (!version) {
    throw new Error('package.json is missing version')
  }
  ensureVersionInChangelog(version)

  if (args.channel !== 'stable' && args.channel !== 'beta') {
    throw new Error(`Unsupported channel: ${args.channel}`)
  }

  if (isGitRepo()) {
    const dirty = getGitStatus()
    const branch = getGitBranch()
    const allowDirty = process.env.ALLOW_DIRTY_RELEASE === '1'
    if (dirty && !allowDirty) {
      throw new Error('Git worktree is dirty. Commit/stash changes or set ALLOW_DIRTY_RELEASE=1')
    }
    if (args.channel === 'stable' && branch !== 'main' && branch !== 'master') {
      throw new Error(`Stable release must run from main/master. Current branch: ${branch}`)
    }
    log('preflight', `git branch=${branch || 'unknown'} dirty=${dirty ? 'yes' : 'no'}`)
  } else {
    log('preflight', 'No git repository detected; skipping branch/dirty checks')
  }

  if (!repo) {
    throw new Error('Failed to parse GitHub publish repo from electron-builder.yml')
  }

  if (!args.dryRun && !args.skipPublish) {
    if (!commandExists('gh')) {
      throw new Error('GitHub CLI (gh) is required for publish step')
    }
    if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
      throw new Error('GH_TOKEN or GITHUB_TOKEN is required for publish step')
    }
  }

  log(
    'preflight',
    `version=${version} repo=${repo} channel=${args.channel} dryRun=${args.dryRun}`
  )

  return { pkg, repo, version }
}

function test(args) {
  if (args.skipTests) {
    log('test', 'skipped (--skip-tests)')
    return
  }
  run('npm', ['run', 'typecheck'])
  run('npm', ['test'])
}

function build(args) {
  if (args.skipBuild) {
    log('build', 'skipped (--skip-build)')
    return
  }
  const script =
    process.platform === 'win32'
      ? 'build:win'
      : process.platform === 'darwin'
        ? 'build:mac'
        : 'build:linux'
  run('npm', ['run', script])
}

function sign(args, context) {
  if (args.skipSign) {
    log('sign', 'skipped (--skip-sign)')
    return
  }

  if (process.platform !== 'win32') {
    log('sign', 'non-Windows platform; relying on native builder signing integration')
    return
  }

  const targets = listWindowsSignTargets(context.version)
  if (targets.length === 0) {
    throw new Error('No Windows executables found to sign')
  }

  const mode = detectMode()
  if (mode === 'none') {
    if (args.dryRun || process.env.ALLOW_UNSIGNED_RELEASE === '1') {
      log('sign', 'No signing credentials found; continuing unsigned because dry-run/override is enabled')
      return
    }
    throw new Error(
      'Windows release requires signing credentials. Provide CSC_LINK/CSC_KEY_PASSWORD or Azure Key Vault variables, or set ALLOW_UNSIGNED_RELEASE=1 explicitly.'
    )
  }

  if (args.dryRun) {
    log('sign', `dry-run: would sign ${targets.length} file(s) via ${mode}`)
    return
  }

  run('node', [path.join('scripts', 'sign.js'), ...targets.map((target) => path.relative(ROOT, target))])
}

function smokeTest(args, context) {
  if (args.skipSmoke) {
    log('smoke', 'skipped (--skip-smoke)')
    return
  }

  const installer = findInstaller()
  if (args.dryRun) {
    log('smoke', `dry-run: would smoke test ${path.basename(installer)}`)
    return
  }

  run('node', [
    path.join('scripts', 'smoke-installer.js'),
    path.relative(ROOT, installer),
    `--version=${context.version}`
  ])
}

function publish(args, context) {
  const assets = listReleaseAssets(context.version)
  if (assets.length === 0) {
    throw new Error('No release assets found in dist/')
  }

  if (args.skipPublish || args.dryRun) {
    log(
      'publish',
      `${args.dryRun ? 'dry-run' : 'skipped'}: assets=${assets.map((asset) => path.basename(asset)).join(', ')}`
    )
    return
  }

  const tag = releaseTag(context.version)
  const repo = context.repo
  const assetArgs = assets.map((asset) => path.relative(ROOT, asset))
  const isBeta = args.channel === 'beta'
  const target = process.env.RELEASE_TARGET || 'main'
  const view = capture('gh', ['release', 'view', tag, '--repo', repo])

  if (view.status === 0) {
    run('gh', ['release', 'upload', tag, ...assetArgs, '--clobber', '--repo', repo])
    log('publish', `updated existing release ${tag}`)
    return
  }

  const createArgs = [
    'release',
    'create',
    tag,
    ...assetArgs,
    '--repo',
    repo,
    '--title',
    tag,
    '--notes-file',
    path.relative(ROOT, CHANGELOG_PATH),
    '--target',
    target,
    '--draft'
  ]
  if (isBeta) {
    createArgs.push('--prerelease')
  }
  run('gh', createArgs)
  log('publish', `created release ${tag}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  log('start', `ClipVault release pipeline starting (pid=${process.pid})`)
  const context = preflight(args)
  test(args)
  build(args)
  sign(args, context)
  smokeTest(args, context)
  publish(args, context)
  log('done', 'release pipeline completed')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[release] FAILED: ${error.message}`)
    process.exit(1)
  }
}

module.exports = {
  parseArgs,
  listReleaseAssets,
  listWindowsSignTargets,
  parseBuilderRepo,
  preflight
}
