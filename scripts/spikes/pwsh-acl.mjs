// Explicitly authorized V6 scope: only new %TEMP%/clipvault-v6-* test directories.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

if (!process.argv.includes('--allow-acl-test')) {
  process.stdout.write('Not run: explicit temporary-directory ACL test approval required.\n'); process.exit(0)
}
const runtime = resolve(dirname(fileURLToPath(import.meta.url)), '../../resources/harness-runtime')
const root = await mkdtemp(join(tmpdir(), 'clipvault-v6-'))
const workspace = join(root, 'workspace'), temporary = join(root, 'temp'), outside = join(root, 'outside.txt')
await mkdir(workspace); await mkdir(temporary); await writeFile(outside, 'SYNTHETIC_OUTSIDE_UNCHANGED')
const env = {}
for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SystemDrive', 'OS']) if (process.env[key]) env[key] = process.env[key]
Object.assign(env, { PATH: `${runtime};${join(env.SystemRoot, 'System32')}`, HOME: temporary, USERPROFILE: temporary, APPDATA: temporary, LOCALAPPDATA: temporary, TEMP: temporary, TMP: temporary })
async function run(command, timeoutMs = 10_000) {
  const child = spawn(join(runtime, 'node.exe'), [join(runtime, 'pwsh-worker.mjs')], { cwd: workspace, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', error = ''
  child.stdout.setEncoding('utf8').on('data', text => { output += text }); child.stderr.setEncoding('utf8').on('data', text => { error += text })
  child.stdin.end(JSON.stringify({ command, timeoutMs }))
  const timer = setTimeout(() => child.kill(), 30_000)
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
  clearTimeout(timer)
  assert.equal(code, 0, `Worker failed: ${output} ${error}`)
  return JSON.parse(output)
}
let report
try {
  const quoted = outside.replaceAll("'", "''")
  const result = await run(`Set-Content -LiteralPath './allowed.txt' -Value 'SYNTHETIC_INSIDE_OK' -ErrorAction Stop; try { Set-Content -LiteralPath '${quoted}' -Value 'MUST_NOT_WRITE' -ErrorAction Stop; throw 'OUTSIDE_WRITE_SUCCEEDED' } catch { if ($_.Exception.Message -eq 'OUTSIDE_WRITE_SUCCEEDED') { throw }; Write-Output 'OUTSIDE_DENIED' }`)
  assert.equal(result.exitCode, 0)
  assert.equal(result.sandbox.mode, 'workspace-write'); assert.equal(result.sandbox.enforcement, 'partial')
  assert.match(result.stdout.text, /OUTSIDE_DENIED/)
  assert.equal(await readFile(outside, 'utf8'), 'SYNTHETIC_OUTSIDE_UNCHANGED')
  assert.match(await readFile(join(workspace, 'allowed.txt'), 'utf8'), /SYNTHETIC_INSIDE_OK/)
  const timeout = await run('Start-Sleep -Seconds 30', 1000)
  assert.equal(timeout.timedOut, true)
  report = { passed: true, officialExecutor: true, insideWrite: true, outsideWriteDenied: true, timeoutKilled: true, readIsolation: false, networkIsolation: false }
} catch (error) { report = { passed: false, error: error.message } }
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
process.stdout.write(JSON.stringify({ ...report, report: join(root, 'report.json') }) + '\n')
if (!report.passed) process.exitCode = 1
