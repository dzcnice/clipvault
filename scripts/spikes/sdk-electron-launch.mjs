// V1: packaged official SDK in a real Electron main process; intercept before spawning a child.
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = mkdtempSync(join(tmpdir(), 'cv-sdk-electron-'))
const entry = join(root, 'probe.mjs')
const source = `
import { app } from 'electron';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { HarnessClient } from '@deepseek-ai/dsh-sdk-client';
app.setPath('userData', ${JSON.stringify(root)});
app.whenReady().then(() => {
let observed;
childProcess.spawn = (command) => { observed = command; throw new Error('synthetic-spawn-intercept'); };
syncBuiltinESMExports();
try { new HarnessClient({ dshBin: ${JSON.stringify(resolve('resources/harness-runtime/runtime.mjs'))} }).start(); } catch {}
process.stdout.write(JSON.stringify({ electron: process.versions.electron, command: observed, executable: process.execPath, usesCallerExecutable: observed === process.execPath }) + '\\n');
app.exit(observed === process.execPath ? 0 : 1);
});
`
await build({ stdin: { contents: source, resolveDir: resolve('.') }, outfile: entry, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['electron'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } })
const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root, TEMP: root, TMP: root }
const result = spawnSync(resolve('node_modules/electron/dist/electron.exe'), [entry, `--user-data-dir=${root}`], { env, windowsHide: true, encoding: 'utf8', timeout: 30_000 })
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(result.stdout.trim().split('\n').at(-1))
assert(report.electron && report.usesCallerExecutable)
writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2))
process.stdout.write(JSON.stringify({ V1: 'direct independent-Node launch unsupported; use documented worker fallback', report: join(root, 'report.json'), ...report }) + '\n')
