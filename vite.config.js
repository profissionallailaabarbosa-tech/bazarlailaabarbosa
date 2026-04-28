import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const buildId = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-build-id',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `    <meta name="app-build-id" content="${buildId}" />\n  </head>`
        )
      },
    },
  ],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
})
