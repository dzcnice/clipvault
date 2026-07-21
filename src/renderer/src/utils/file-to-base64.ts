/**
 * file-to-base64 (ρ2 · P0-R5 · σ1 · P1-R2 扩展)
 *
 * 把浏览器 File 异步转为 base64 / 文本字符串，用于 Import Wizard 的大文件
 * （.1pux / .csv / .json；1Password .1pux 通常 5–50 MB，Bitwarden 导出 JSON
 * 也会到数 MB）。
 *
 * 旧实现用同步 for 循环 + String.fromCharCode + btoa，或 `await file.text()`
 * 均会卡住主线程 1-15 秒（50MB .1pux 实测），甚至触发 Electron 的"无响应"对话框。
 *
 * 这里用 Web API FileReader：浏览器原生实现，走 off-main-thread 解码。
 *
 * 用法：
 *   const base64 = await fileToBase64Async(file)
 *   await api.parse('onepassword', base64, { base64: true })
 *
 *   const text = await fileToTextAsync(file)
 *   await api.parse('bitwarden', text)
 */

/**
 * 将 File 转为 base64（无 data URL 前缀）。
 *
 * 失败原因：
 *   - 用户取消 / 权限问题 → reader.onerror 触发，rejects with FileReader.error
 *   - 超大文件 OOM（浏览器会抛 "NotReadableError"）
 *
 * 稳定性保证：
 *   - 永远只用 once 的 Promise 通道
 *   - 异常路径一定 reject，不会悬挂
 */
export async function fileToBase64Async(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader 结果非字符串（异常输入）'))
        return
      }
      // dataURL 格式：`data:<mime>;base64,<payload>`
      const commaIndex = result.indexOf(',')
      if (commaIndex === -1) {
        // 兜底：若不是 data URL（理论不会，readAsDataURL 必然带前缀）
        resolve(result)
        return
      }
      resolve(result.slice(commaIndex + 1))
    }
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('FileReader 未知错误'))
    }
    reader.onabort = (): void => {
      reject(new Error('读取被中止'))
    }
    try {
      reader.readAsDataURL(file)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/**
 * 将 File 异步转为文本字符串（UTF-8，可覆盖编码）。
 *
 * 用于 Bitwarden / Chrome / LastPass / KeePass CSV/JSON 导出文件。
 * 相比 `await file.text()`（会在大文件时同步卡顿 1-3s），这里通过 FileReader
 * 让解码发生在后台线程，不阻塞 UI。
 *
 * 失败原因：
 *   - 非文本编码 → onerror 触发，rejects with FileReader.error
 *   - 用户取消 / 权限问题 → onabort
 *   - 文件异常大 OOM → 浏览器抛 NotReadableError
 *
 * 稳定性保证：
 *   - 永远只用 once 的 Promise 通道
 *   - 异常路径一定 reject，不会悬挂
 */
export async function fileToTextAsync(file: File, encoding = 'utf-8'): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (): void => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader 结果非字符串（异常输入）'))
        return
      }
      resolve(result)
    }
    reader.onerror = (): void => {
      reject(reader.error ?? new Error('FileReader 未知错误'))
    }
    reader.onabort = (): void => {
      reject(new Error('读取被中止'))
    }
    try {
      reader.readAsText(file, encoding)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
