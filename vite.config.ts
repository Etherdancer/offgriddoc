import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        navigateFallbackDenylist: [
          /^\/about-us/,
          /^\/privacy-policy/,
          /^\/terms-of-use/,
          /^\/contact-me/
        ]
      },
      manifest: {
        name: 'OffGridDoc - Zero-Knowledge Document Redactor',
        short_name: 'OffGridDoc',
        description: 'Securely redact documents offline and strip metadata.',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'favicon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
