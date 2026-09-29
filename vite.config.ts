import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/**
 * Serves (dev) and emits (build) the Tesseract worker and LSTM WebAssembly cores under
 * `/tesseract/`, so OCR code is self-hosted instead of loaded from a CDN.
 */
function selfHostTesseract(): Plugin {
  const coreDir = dirname(require.resolve('tesseract.js-core/package.json'))
  const files: Record<string, string> = {
    'worker.min.js': join(dirname(require.resolve('tesseract.js/package.json')), 'dist/worker.min.js'),
  }
  for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
    files[f] = join(coreDir, f)
  }
  // English ships with the app so the default language works offline from the first run.
  files['lang/eng.traineddata.gz'] = join(
    dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int/eng.traineddata.gz'
  )
  return {
    name: 'self-host-tesseract',
    configureServer(server) {
      server.middlewares.use('/tesseract/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        const path = files[name]
        if (!path) return next()
        res.setHeader('Content-Type', name.endsWith('.gz') ? 'application/gzip' : 'text/javascript')
        res.end(readFileSync(path))
      })
    },
    generateBundle() {
      for (const [name, path] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: readFileSync(path) })
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    selfHostTesseract(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // The OCR cores are several MB each: cache them when first used instead of on install.
        globIgnores: ['**/tesseract/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr-engine', expiration: { maxEntries: 10 } },
          },
        ],
        navigateFallbackDenylist: [
          /^\/about-us/,
          /^\/privacy-policy/,
          /^\/terms-of-use/,
          /^\/terms/,
          /^\/contact-me/
        ]
      },
      manifest: {
        name: 'OffGridDoc - Offline Document Redactor',
        short_name: 'OffGridDoc',
        description: 'Securely redact documents offline and strip metadata.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy PDF/OCR libraries out of the main chunk.
        manualChunks(id) {
          if (id.includes('pdfjs-dist')) return 'pdf'
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'jspdf'
          if (id.includes('tesseract')) return 'ocr'
        },
      },
    },
  },
})
