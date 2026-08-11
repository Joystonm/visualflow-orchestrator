import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudinaryGeneratePlugin } from './server/cloudinaryGenerate'

// Pollinations (the keyless fallback generator) blocks browser-origin requests,
// so the dev server proxies it. Cloudinary generation runs through the
// /api/generate middleware, which keeps the API secret server-side.
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

export default defineConfig(({ mode }) => {
  // Load ALL env vars (not just VITE_*) for server-side use. Only VITE_-prefixed
  // values are ever exposed to client code.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), cloudinaryGeneratePlugin(env)],
    server: { proxy },
    preview: { proxy },
  }
})
