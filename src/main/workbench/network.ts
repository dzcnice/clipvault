import * as electron from 'electron'

/** Chromium 采用系统网络/代理配置；纯 Node 测试通过标准 fetch 注入夹具。 */
export function requestNetwork(url: URL | string, options: RequestInit): Promise<Response> {
  return 'net' in electron && electron.net?.fetch ? electron.net.fetch(String(url), options) : fetch(url, options)
}
