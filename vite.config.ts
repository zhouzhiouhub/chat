import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const proxy = {
  '/proxy/openai': {
    target: 'https://api.openai.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/openai/, '/v1'),
  },
  '/proxy/volcengine': {
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/volcengine/, '/api/v3'),
  },
  '/proxy/google': {
    target: 'https://generativelanguage.googleapis.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/proxy\/google/, '/v1'),
  },
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
