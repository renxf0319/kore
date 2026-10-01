import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Kore 前端构建配置
// - base: './' 让产物用相对路径，适配 Tauri 的自定义协议加载
// - worker.format: 'es' 让 Markdown 解析跑在 ES Module Web Worker 中
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
  worker: { format: 'es' },
})
