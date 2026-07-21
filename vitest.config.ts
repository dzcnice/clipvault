import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Vitest 单元测试配置
// - 主进程 / utils / renderer 公用同一个 config
// - renderer 测试文件通过顶部 `// @vitest-environment jsdom` 指令切换到 jsdom
// - node 环境为默认（主进程 .test.ts）
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', 'dist', 'out', 'e2e/**', 'dist-types*/**'],
    setupFiles: ['./test-setup/renderer.ts'],
    // 集成测试默认放宽到 30s（HIBP / mDNS / signaling 均涉及 IO）
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/main/crypto/**/*.ts',
        'src/utils/key-detector.ts',
        'src/utils/key-patterns.ts',
        'src/utils/fuzzy-search.ts'
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.d.ts',
        'e2e/**',
        'dist-types*/**',
        'out/**',
        'dist/**'
      ],
      // v2.0 Sprint 15 TASK-080：覆盖率门槛
      // 作用范围仅对 include 列表（crypto / key-detector / key-patterns / fuzzy-search），
      // 这些模块均有专门测试，基线门槛按保守设置；若实跑未达标可下调数值。
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@types': resolve(__dirname, 'src/types'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      // 单测环境没有真实 electron 二进制，全局 alias 到 stub，避免
      // "Electron failed to install correctly" 错误。
      // 已有测试里的 vi.mock('electron', ...) 优先级更高，不受影响。
      electron: resolve(__dirname, 'test-setup/electron-stub.ts')
    }
  }
})
