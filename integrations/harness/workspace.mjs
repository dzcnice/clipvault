// Official workspace-changes recorder with a git-only subprocess provider.
// Snapshots stay in this Host's private TEMP (the session home inside app data) and are
// removed when the Session is released; summaries and diffs go to the main process,
// which redacts and encrypts them. No other executable can be launched through this seam.
import { spawn, execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import * as WorkspaceChanges from '@deepseek-ai/dsh-workspace-changes'

export const name = 'clipvault-workspace'
export const inject = ['fs']
const MAX_FILES = 200, MAX_DIFF_FILES = 40, MAX_HUNK_LINES = 400

function gitPath() {
  const value = process.env.CV_GIT_PATH
  return value && isAbsolute(value) && existsSync(value) ? value : null
}

function collector(maxBytes) {
  const chunks = []
  let size = 0, lossy = false
  return {
    push(chunk) {
      if (size >= maxBytes) { lossy = true; return }
      const room = maxBytes - size, part = chunk.length > room ? chunk.subarray(0, room) : chunk
      if (part.length < chunk.length) lossy = true
      chunks.push(part); size += part.length
    },
    reader: { readFrom: offset => ({ text: Buffer.concat(chunks).subarray(offset).toString('utf8'), lossy }) }
  }
}

/** Minimal `subprocess` seam: resolves and runs only the git executable chosen by the main process. */
function gitOnlySubprocess() {
  const git = gitPath()
  return {
    async resolveExecutable(command) {
      if (command !== 'git' || !git) throw new Error('only git is available to workspace-changes')
      return git
    },
    spawn(request) {
      const [executable, ...args] = request.argv ?? []
      if (!git || executable !== git) throw new Error('only git is available to workspace-changes')
      const home = process.env.HOME
      const child = spawn(git, ['-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', ...args], {
        cwd: request.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: [dirname(git), process.env.SystemRoot && join(process.env.SystemRoot, 'System32')].filter(Boolean).join(';'),
          HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: '1', TEMP: process.env.TEMP, TMP: process.env.TMP, ...request.env }
      })
      const stdout = collector(request.stdio?.stdout?.maxBytes ?? 1 << 20), stderr = collector(request.stdio?.stderr?.maxBytes ?? 16384)
      child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk))
      child.stdin.on('error', () => {})
      if (request.stdio?.stdin && typeof request.stdio.stdin === 'object' && 'data' in request.stdio.stdin) child.stdin.end(request.stdio.stdin.data)
      else child.stdin.end()
      let killTimer
      const abort = () => {
        try { child.kill() } catch { /* already exited */ }
        killTimer = setTimeout(() => { if (child.exitCode === null && child.pid) execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {}) }, request.graceMs ?? 2000)
      }
      if (request.signal?.aborted) abort(); else request.signal?.addEventListener('abort', abort, { once: true })
      const done = new Promise(resolve => {
        child.once('error', () => resolve({ exitCode: null }))
        child.once('close', code => { clearTimeout(killTimer); request.signal?.removeEventListener('abort', abort); resolve({ exitCode: code }) })
      })
      return { done, collected: { stdout: stdout.reader, stderr: stderr.reader } }
    }
  }
}

async function report(path, body) {
  const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: process.env.CV_SESSION_ID }), signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) throw new Error('workspace report rejected')
}

export async function apply(ctx) {
  ctx.provide('subprocess', gitOnlySubprocess())
  await ctx.plugin(WorkspaceChanges, { timeoutMs: 30_000, outputMaxBytes: 8 * 1024 * 1024, maxFiles: MAX_FILES, maxFileBytes: 512 * 1024, diffTimeoutMs: 100 }).await()
  const root = process.env.CV_SESSION_ID
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'workspace/changes' || session.id !== root) return
    void (async () => {
      // The recorder stores the summary right after appending the event; read it on the next tick.
      await new Promise(resolve => setImmediate(resolve))
      const changes = ctx.get('workspaceChanges')
      const summary = changes?.summary(session.id, event.seq)
      if (!summary) { await report('workspace_skip', { seq: event.seq }); return }
      const signal = AbortSignal.timeout(20_000), diffs = []
      for (let index = 0; index < Math.min(summary.files.length, MAX_DIFF_FILES); index++) {
        const diff = await changes.diff(session.id, event.seq, index, signal).catch(() => undefined)
        if (diff?.kind === 'text') {
          let budget = MAX_HUNK_LINES
          diffs.push({ index, kind: 'text', coarse: diff.coarse, hunks: diff.hunks.map(hunk => { const lines = hunk.lines.slice(0, Math.max(0, budget)); budget -= lines.length; return { ...hunk, lines } }).filter(hunk => hunk.lines.length) })
        } else if (diff) diffs.push({ index, kind: diff.kind })
      }
      await report('workspace_changes', { seq: event.seq, summary: { turn: summary.turn, files: summary.files, total: summary.total, added: summary.added, deleted: summary.deleted }, diffs })
    })().catch(() => { void report('workspace_skip', { seq: event.seq }).catch(() => {}) })
  })
}
