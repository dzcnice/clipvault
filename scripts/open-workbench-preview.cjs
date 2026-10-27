/** Launch a disposable preview without opening the installed ClipVault data. */
const { mkdtempSync, writeFileSync, existsSync, openSync, realpathSync } = require('node:fs')
const { join, resolve, relative, isAbsolute, sep } = require('node:path')
const { tmpdir } = require('node:os')
const { spawn } = require('node:child_process')
const root = resolve(__dirname, '..')
const main = join(root, 'out/main/index.js')
if (!existsSync(main)) throw new Error('Run npm run build first')
const supplied = process.argv.indexOf('--profile')
const profile = supplied >= 0 ? realpathSync.native(process.argv[supplied + 1]) : mkdtempSync(join(tmpdir(), 'clipvault-workbench-preview-'))
const relativeProfile = relative(realpathSync.native(tmpdir()), realpathSync.native(profile))
if (isAbsolute(relativeProfile) || relativeProfile.startsWith('..') || !relativeProfile.split(sep)[0].startsWith('clipvault-workbench-preview-')) throw new Error('Only disposable ClipVault preview profiles are allowed')
if (!existsSync(join(profile, 'clipvault-prefs.json'))) writeFileSync(join(profile, 'clipvault-prefs.json'), JSON.stringify({ clipboardMonitorEnabled: false, autoUpdateCheck: false, onboardingTipsSeen: true }))
writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'clipvault-preview', version: require('../package.json').version, main: 'bootstrap.cjs' }))
writeFileSync(join(profile, 'bootstrap.cjs'), `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(profile)});\napp.setName('ClipVault Preview');\nrequire(${JSON.stringify(main)});\n`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
delete env.NODE_OPTIONS
const child = spawn(join(root, 'node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron'), [profile], {
  cwd: root, env, detached: true, stdio: ['ignore', openSync(join(profile, 'stdout.log'), 'a'), openSync(join(profile, 'stderr.log'), 'a')]
})
child.unref()
process.stdout.write(JSON.stringify({ pid: child.pid, profile, application: main }) + '\n')
