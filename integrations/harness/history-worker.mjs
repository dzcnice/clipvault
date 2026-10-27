// Local, short-lived official FTS index. Input is already redacted; nothing is written to disk.
import { Context } from '@deepseek-ai/cordis'
import Session from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Query from '@deepseek-ai/dsh-session-query-sqlite'
import VaultPersistence from './encrypted-persistence.mjs'

let source = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) {
  source += chunk.toString('utf8')
  if (Buffer.byteLength(source) > 26_000_000) throw new Error('History search input exceeds limit')
}
const input = JSON.parse(source)
if (!Array.isArray(input.documents) || input.documents.length > 200 || typeof input.query !== 'string' || input.query.length > 300) throw new Error('Invalid history request')
const snapshots = new Map(input.documents.map(document => [document.header.id, document]))
class SearchPersistence extends VaultPersistence {
  async request(operation, payload = {}) {
    const saved = snapshots.get(payload.id)
    if (operation === 'read') return structuredClone(saved ?? null)
    if (operation === 'count') return { count: saved?.events.length ?? 0 }
    throw new Error('Search history is read-only')
  }
  async list(options) { return (await Promise.all([...snapshots.keys()].map(id => this.stat(id, options)))).filter(Boolean) }
  async create() { throw new Error('Search history is read-only') }
  async open(id, access, options) { if (access !== 'read') throw new Error('Search history is read-only'); return super.open(id, access, options) }
}
const ctx = new Context()
try {
  await ctx.plugin(Session).await()
  await ctx.plugin(Projections).await()
  await ctx.plugin(SearchPersistence).await()
  await ctx.plugin(Query, { path: ':memory:', openAt: 'startup', defaultLimit: 30, maxLimit: 50, snippetChars: 240 }).await()
  const page = await ctx.get('sessionQuery').searchSessions({ query: input.query, limit: 50 })
  process.stdout.write(JSON.stringify({ items: page.items.map(item => ({ id: item.header.id, snippet: item.bestMatch.snippet, seq: item.bestMatch.seq })) }))
} catch {
  process.stdout.write(JSON.stringify({ error: '本机会话索引暂不可用' })); process.exitCode = 1
} finally { await ctx.fiber.dispose() }
