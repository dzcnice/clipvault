/** 资源与前台窗口的匹配分：名称、别名或地址域名出现在窗口标题里。 */
export function matchScore(window: { title: string; process: string }, resource: { name: string; endpoint?: string; loginUrl?: string; aliases?: string[] }): number {
  const title = `${window.title} ${window.process}`.toLowerCase()
  if (!title.trim()) return 0
  let score = 0
  for (const url of [resource.loginUrl, resource.endpoint]) {
    try { const host = new URL(url ?? '').hostname.replace(/^www\./, ''); const brand = host.split('.').at(-2); if (host && title.includes(host)) score = Math.max(score, 3); else if (brand && brand.length > 2 && title.includes(brand)) score = Math.max(score, 2) } catch { /* 不是网址 */ }
  }
  for (const name of [resource.name, ...resource.aliases ?? []]) if (name && name.trim().length > 1 && title.includes(name.trim().toLowerCase())) score = Math.max(score, 2)
  return score
}
