import { pendingOcrImages, setClipboardOcr } from '../../db/clipboard-store'
import { isUnlocked } from '../crypto/vault'
import { logger } from '../utils/logger'
import { clipboardCaptured } from './captured'
import type { ClipboardItem } from '../../types'

type Recognize = (path: string) => Promise<{ text: string }>

/**
 * 剪贴板图片的本机 OCR：一次一张、两张之间留出空闲，新图优先，结果加密入库。
 * 不联网；锁库即停；识别失败或没有文字也会记录，避免反复占用 CPU。
 */
export class OcrQueue {
  private running = false
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  constructor(private readonly recognize: Recognize, private readonly onDone?: (id: string) => void, private readonly gapMs = 800) {}

  start(startDelayMs = 15_000): void {
    this.stopped = false
    clipboardCaptured.on('item', this.onItem)
    this.kick(startDelayMs)
  }
  stop(): void {
    this.stopped = true
    clearTimeout(this.timer)
    clipboardCaptured.off('item', this.onItem)
  }
  private onItem = (item: ClipboardItem): void => { if (item.type === 'image') this.kick(1500) }
  kick(delay = 0): void {
    if (this.stopped) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.run() }, delay)
    this.timer.unref?.()
  }
  /** 处理完当前积压后返回（测试与手动触发用）。 */
  async run(): Promise<number> {
    if (this.running || this.stopped || !isUnlocked()) return 0
    this.running = true
    let done = 0
    try {
      for (;;) {
        if (this.stopped || !isUnlocked()) break
        const [next] = pendingOcrImages(1)
        if (!next) break
        let state: 'done' | 'empty' | 'failed' = 'failed', text = ''
        try { text = (await this.recognize(next.imagePath)).text.trim(); state = text ? 'done' : 'empty' }
        catch (error) { state = error instanceof Error && /没有识别到文字/.test(error.message) ? 'empty' : 'failed' }
        if (!isUnlocked()) break
        setClipboardOcr(next.id, state, text)
        done++
        this.onDone?.(next.id)
        await new Promise(resolve => setTimeout(resolve, this.gapMs))
      }
    } catch (error) { logger.warn('[ocr] 后台识别中止：' + (error instanceof Error ? error.message : String(error))) }
    finally { this.running = false }
    return done
  }
}
