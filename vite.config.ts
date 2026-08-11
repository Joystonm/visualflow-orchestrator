import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Pollinations blocks browser-origin requests (403 on cross-origin Referer),
// so the dev server acts as the minimal server-side adapter — no keys involved.
const proxy = {
  '/api/image': {
    target: 'https://image.pollinations.ai',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/image/, ''),
    headers: { Referer: '', Origin: '' },
  },
  '/api/text': {
    target: 'https://text.pollinations.ai',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/text/, ''),
    headers: { Referer: '', Origin: '' },
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
