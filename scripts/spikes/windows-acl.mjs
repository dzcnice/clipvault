// V6: only this script's fresh temporary directories may receive ACL changes.
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import assert from 'node:assert/strict'

if (!process.argv.includes('--allow-acl-test')) {
  process.stdout.write(JSON.stringify({ gate: 'V6', status: 'not-run', reason: 'Requires explicit approval for ACL changes inside fresh test directories only.' }) + '\n')
  process.exit(0)
}
if (process.platform !== 'win32') throw new Error('V6 requires Windows')
const { AclSandbox, workspaceWriteSid, tempWriteSid } = await import('@deepseek-ai/dsh-sandbox-windows-acl')
const root = await mkdtemp(join(tmpdir(), 'clipvault-v6-'))
const workspace = join(root, 'workspace'), temp = join(root, 'temp'), outside = join(root, 'outside')
for (const path of [workspace, temp, outside]) {
  const rel = relative(resolve(root), resolve(path))
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel))
  await mkdir(path)
}
const protectedFile = join(outside, 'unchanged.txt')
await writeFile(protectedFile, 'SYNTHETIC_OUTSIDE_UNCHANGED')
const sandbox = new AclSandbox({ mode: 'workspace-write', writableDirs: [workspace], tempDir: temp, writeSid: workspaceWriteSid(workspace), tempWriteSid: tempWriteSid(temp) })
let report
try {
  await sandbox.init()
  const script = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(workspace, 'allowed.txt'))},'SYNTHETIC_INSIDE_OK');let denied=false;try{fs.writeFileSync(${JSON.stringify(protectedFile)},'MUST_NOT_WRITE')}catch{denied=true}process.stdout.write(JSON.stringify({inside:true,outsideDenied:denied}));process.exitCode=denied?0:2;`
  const child = sandbox.spawn({ command: process.execPath, args: ['-e', script], cwd: workspace })
  const timer = setTimeout(() => { process.stderr.write('V6 timed out\n'); process.exit(2) }, 20_000)
  let result
  try { result = await child.wait() } finally { clearTimeout(timer) }
  const evidence = JSON.parse(result.stdout.toString())
  assert.equal(result.exitCode, 0); assert.equal(evidence.outsideDenied, true)
  assert.equal(await readFile(protectedFile, 'utf8'), 'SYNTHETIC_OUTSIDE_UNCHANGED')
  assert.equal(await readFile(join(workspace, 'allowed.txt'), 'utf8'), 'SYNTHETIC_INSIDE_OK')
  report = { gate: 'V6', status: 'passed', insideWrite: true, outsideWriteDenied: true, readIsolation: false, networkIsolation: false }
} catch (error) {
  report = { gate: 'V6', status: 'failed', error: error instanceof Error ? error.message : 'ACL check failed', arbitraryTerminalEnabled: false }
} finally { try { sandbox.dispose() } catch { report = { ...report, status: 'failed', cleanup: 'TEMP ACL disposal failed; test directories preserved' } } }
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
process.stdout.write(JSON.stringify({ ...report, report: join(root, 'report.json') }) + '\n')
if (report.status !== 'passed') process.exitCode = 1
