/** Actual Electron safeStorage persistence across restart and an explicit profile copy. */
const { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { spawnSync } = require('node:child_process')
const root = mkdtempSync(join(tmpdir(), 'clipvault-storage-acceptance-')), original = join(root, 'original'), copied = join(root, 'copied')
mkdirSync(original); mkdirSync(copied)
const fixture = join(root, 'fixture.cjs')
writeFileSync(fixture, `const {app,safeStorage}=require('electron'); const fs=require('node:fs'),path=require('node:path'); const profile=process.argv[2]; app.setPath('userData',profile); app.setName('Storage Acceptance'); app.whenReady().then(()=>{try {const file=path.join(profile,'canary.bin'); if(process.argv[3]==='create') fs.writeFileSync(file,safeStorage.encryptString('SYNTHETIC-PERSISTENCE-CANARY')); else if(safeStorage.decryptString(fs.readFileSync(file))!=='SYNTHETIC-PERSISTENCE-CANARY') throw new Error('Canary mismatch'); process.stdout.write('STORAGE_OK\\n'); app.quit()}catch {process.stdout.write('STORAGE_FAILED\\n');app.quit()}});`)
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS
const electron = resolve('node_modules/electron/dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
function run(profile, mode) {
  const result = spawnSync(electron, [fixture, profile, mode], { env, windowsHide: true, timeout: 15000, encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout?.includes('STORAGE_OK')) throw new Error('safeStorage persistence check failed: ' + mode)
}
run(original, 'create'); run(original, 'read')
copyFileSync(join(original, 'canary.bin'), join(copied, 'canary.bin'))
if (existsSync(join(original, 'Local State'))) copyFileSync(join(original, 'Local State'), join(copied, 'Local State'))
run(copied, 'read')
process.stdout.write(JSON.stringify({ passed: true, original, copied, restarted: true, explicitProfileCopy: true }) + '\n')
