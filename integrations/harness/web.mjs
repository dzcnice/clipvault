// Official web_search / web_fetch tools over the official `ctx.web` seam. The Host never touches the
// network itself: both providers forward to the main process, which blocks private addresses,
// rejects requests that carry protected values, caps sizes and redirects.
import WebRuntime from '@deepseek-ai/dsh-web'
import * as ToolWeb from '@deepseek-ai/dsh-tool-web'

export const name = 'clipvault-web'

async function forward(path, body, signal) {
  const response = await fetch(`${process.env.CV_BRIDGE_URL}/control/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId: process.env.CV_SESSION_ID }), signal: AbortSignal.any([AbortSignal.timeout(45_000), ...(signal ? [signal] : [])])
  })
  if (!response.ok) throw new Error('联网请求被拒绝或不可用')
  const result = await response.json()
  if (result?.error) throw new Error(String(result.error))
  return result
}

export async function apply(ctx) {
  await ctx.plugin(WebRuntime, {}).await()
  await ctx.plugin({ name: 'clipvault-web-providers', inject: ['web'], apply(scope) {
    scope.web.registerSearchProvider({ id: 'clipvault-search', available: () => true, search: (request, signal) => forward('web_search', { query: request.query, maxResults: request.maxResults }, signal) })
    scope.web.registerFetchProvider({ id: 'clipvault-fetch', available: () => true, fetch: (request, signal) => forward('web_fetch', { url: request.url }, signal) })
  } }).await()
  await ctx.plugin(ToolWeb, { searchMaxResults: 6, searchMaxQueries: 3, fetchMaxOutputChars: 60_000 }).await()
}
