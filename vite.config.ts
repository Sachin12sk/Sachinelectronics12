import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'Sachin Electricals',
          short_name: 'SachinApp',
          description: 'Expert Electrical Repairs & Sales in Your City',
          theme_color: '#0f172a',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'https://placehold.co/192x192/1e40af/ffffff.png?text=SE',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'https://placehold.co/512x512/1e40af/ffffff.png?text=SE',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5242880,
          navigateFallbackDenylist: [
            /^\/__/,
            /^https:\/\/(?:firestore\.googleapis\.com|.*\.firebaseio\.com|.*\.firebasedatabase\.app|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/i
          ],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/(?:firestore\.googleapis\.com|.*\.firebaseio\.com|.*\.firebasedatabase\.app|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      dedupe: ['three'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/three/')) return 'vendor-three';
              if (id.includes('/firebase/')) return 'vendor-firebase';
              if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts';
              if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('tesseract.js')) return 'vendor-docs';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) return 'vendor-react';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
