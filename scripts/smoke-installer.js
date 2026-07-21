#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Smoke test packaged installers/artifacts.
 *
 * Windows:
 *   1. Silent-install into a temp directory
 *   2. Launch the installed app with temp profile dirs
 *   3. Verify the process stays alive and exposes a visible main window
 *   4. Kill the app and run the silent uninstaller
 *
 * macOS/Linux:
 *   Best-effort launch smoke on the packaged artifact.
 */

'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const DIST_DIR = path.join(ROOT, 'dist')

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[smoke] ${message}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function findInstaller(explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(ROOT, explicitPath)
    if (!fs.existsSync(resolved)) {
      throw new Error(`Installer not found: ${resolved}`)
    }
    return resolved
  }

  if (!fs.existsSync(DIST_DIR)) {
    throw new Error('dist/ does not exist')
  }

  const candidates = fs
    .readdirSync(DIST_DIR)
    .map((name) => path.join(DIST_DIR, name))
    .filter((filePath) => fs.statSync(filePath).isFile())

  const platformCandidates =
    process.platform === 'win32'
      ? candidates.filter((filePath) => /-setup\.exe$/i.test(filePath))
      : process.platform === 'darwin'
        ? candidates.filter((filePath) => /\.dmg$/i.test(filePath))
        : candidates.filter((filePath) => /\.(AppImage|deb)$/i.test(filePath))

  const latest = platformCandidates.sort((a, b) => {
    return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs
  })[0]

  if (!latest) {
    throw new Error(`No installer found in dist/ for platform ${process.platform}`)
  }

  return latest
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Process timeout after ${timeoutMs}ms`)), timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code ?? 0)
    })
  })
}

function isPidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killProcessTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: true })
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    /* ignore */
  }
}

function getWindowsMainWindowHandle(pid) {
  if (!pid) return 0
  const script = `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty MainWindowHandle)`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8'
  })
  if ((result.status ?? 1) !== 0) return 0
  const raw = (result.stdout || '').trim()
  return Number(raw || '0')
}

async function waitForWindowsMainWindow(pid, timeoutMs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (!isPidAlive(pid)) {
      throw new Error('App process exited before the main window became visible')
    }
    if (getWindowsMainWindowHandle(pid) > 0) {
      return
    }
    await sleep(500)
  }
  throw new Error('Timed out waiting for the main window to appear')
}

function removePath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return
  let lastError = null
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      lastError = error
      spawnSync('powershell', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500'], {
        stdio: 'ignore'
      })
    }
  }
  log(`cleanup warning: failed to remove ${targetPath}: ${lastError.message}`)
}

async function smokeWindows(installer) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-smoke-'))
  const installDir = path.join(tempRoot, 'app')
  const profileDir = path.join(tempRoot, 'profile')
  fs.mkdirSync(installDir, { recursive: true })
  fs.mkdirSync(profileDir, { recursive: true })

  log(`silent-installing ${path.basename(installer)} -> ${installDir}`)
  const installerProc = spawn(installer, ['/S', `/D=${installDir}`], {
    cwd: tempRoot,
    stdio: 'inherit',
    shell: false
  })
  const installerExitCode = await waitForChildExit(installerProc, 180_000)
  if (installerExitCode !== 0) {
    throw new Error(`Installer exited with code ${installerExitCode}`)
  }

  const exePath = path.join(installDir, 'ClipVault.exe')
  if (!fs.existsSync(exePath)) {
    throw new Error(`Installed executable not found: ${exePath}`)
  }

  log('launching installed app')
  const appProc = spawn(exePath, [], {
    cwd: installDir,
    detached: false,
    stdio: 'ignore',
    env: {
      ...process.env,
      APPDATA: profileDir,
      LOCALAPPDATA: profileDir,
      TEMP: tempRoot,
      TMP: tempRoot
    }
  })

  try {
    await sleep(2_500)
    if (!isPidAlive(appProc.pid)) {
      throw new Error('Installed app exited immediately after launch')
    }
    await waitForWindowsMainWindow(appProc.pid, 20_000)
    log('main window detected')
  } finally {
    killProcessTree(appProc.pid)
  }

  const uninstallCandidates = [
    path.join(installDir, 'Uninstall ClipVault.exe'),
    path.join(installDir, 'Uninstall.exe'),
    path.join(installDir, 'unins000.exe')
  ]
  const uninstaller = uninstallCandidates.find((candidate) => fs.existsSync(candidate))
  if (uninstaller) {
    log(`running uninstaller: ${path.basename(uninstaller)}`)
    const uninstallerProc = spawn(uninstaller, ['/S'], {
      cwd: installDir,
      stdio: 'ignore',
      shell: false
    })
    await waitForChildExit(uninstallerProc, 120_000)
  }

  await sleep(2_000)
  removePath(tempRoot)
}

async function smokeDarwin(installer) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-smoke-'))
  const mountDir = path.join(tempRoot, 'mount')
  const appCopyRoot = path.join(tempRoot, 'Applications')
  fs.mkdirSync(mountDir, { recursive: true })
  fs.mkdirSync(appCopyRoot, { recursive: true })

  runOrThrow('hdiutil', ['attach', installer, '-nobrowse', '-readonly', '-mountpoint', mountDir])
  try {
    const appBundle = fs
      .readdirSync(mountDir)
      .find((name) => name.endsWith('.app'))
    if (!appBundle) {
      throw new Error('No .app bundle found inside mounted dmg')
    }
    const sourceApp = path.join(mountDir, appBundle)
    const targetApp = path.join(appCopyRoot, appBundle)
    runOrThrow('cp', ['-R', sourceApp, targetApp])
    const binaryName = path.basename(appBundle, '.app')
    const executable = path.join(targetApp, 'Contents', 'MacOS', binaryName)
    const appProc = spawn(executable, [], {
      cwd: path.dirname(executable),
      detached: false,
      stdio: 'ignore'
    })
    try {
      await sleep(8_000)
      if (!isPidAlive(appProc.pid)) {
        throw new Error('Mounted app exited immediately after launch')
      }
    } finally {
      killProcessTree(appProc.pid)
    }
  } finally {
    runOrThrow('hdiutil', ['detach', mountDir, '-force'])
    removePath(tempRoot)
  }
}

async function smokeLinux(installer) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-smoke-'))
  const ext = path.extname(installer).toLowerCase()
  try {
    if (ext === '.appimage') {
      fs.chmodSync(installer, 0o755)
      const appProc = spawn(installer, ['--appimage-extract-and-run'], {
        cwd: tempRoot,
        detached: false,
        stdio: 'ignore'
      })
      try {
        await sleep(8_000)
        if (!isPidAlive(appProc.pid)) {
          throw new Error('AppImage exited immediately after launch')
        }
      } finally {
        killProcessTree(appProc.pid)
      }
      return
    }
    if (ext === '.deb') {
      log('Skipping .deb install smoke on Linux because it typically requires root privileges')
      return
    }
    throw new Error(`Unsupported Linux artifact for smoke test: ${installer}`)
  } finally {
    removePath(tempRoot)
  }
}

function runOrThrow(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

async function main() {
  const explicit = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : ''
  const installer = findInstaller(explicit)
  log(`installer=${installer}`)

  if (process.platform === 'win32') {
    await smokeWindows(installer)
  } else if (process.platform === 'darwin') {
    await smokeDarwin(installer)
  } else {
    await smokeLinux(installer)
  }

  log('smoke test passed')
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[smoke] FAILED: ${error.message}`)
    process.exit(1)
  })
}

module.exports = {
  findInstaller,
  getWindowsMainWindowHandle,
  isPidAlive
}
