import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@types': resolve('src/types')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@types': resolve('src/types')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src'),
        '@types': resolve('src/types'),
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // v2.0 Sprint 15 TASK-078：Bundle 拆分
    // 将大型第三方库切成独立 chunk，便于并行下载 + 利用长期缓存
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-radix': [
              '@radix-ui/react-checkbox',
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-label',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-slot',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip'
            ],
            // v3：去掉 framer-motion 独立 chunk（源码已改 CSS 动效）
            'vendor-icons': ['lucide-react'],
            'vendor-i18n': ['i18next', 'react-i18next'],
            'vendor-crypto': ['@noble/ciphers', '@noble/curves', '@noble/hashes', 'bip39'],
            'vendor-qr': ['qrcode', 'otpauth'],
            'vendor-cmdk': ['cmdk']
          }
        }
      }
    }
  }
})
