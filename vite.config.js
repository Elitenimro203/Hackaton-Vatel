// Configuration Vite : React + appli installable (PWA) avec le menu et les photos gardés pour le mode hors ligne.
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'photos/*.jpg'],
      manifest: {
        name: 'CantiJuste · Cantine Vatel',
        short_name: 'CantiJuste',
        description: 'Le bon repas, pour la bonne personne, en bonne quantité.',
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1A1310',
        theme_color: '#1A1310',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Menus, profil, réservations : le réseau d'abord, la dernière réponse si on est hors ligne
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'cantijuste-donnees',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com',
            handler: 'CacheFirst',
            options: { cacheName: 'cantijuste-polices', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 } },
          },
        ],
      },
    }),
  ],
})
