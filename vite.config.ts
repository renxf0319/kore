import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// Kore 前端构建配置
// - base: './' 让产物用相对路径，适配 Tauri 的自定义协议加载
// - worker.format: 'es' 让 Markdown 解析跑在 ES Module Web Worker 中
export default defineConfig({
  plugins: [react()],
  base: './',
  // 版本号单一来源 = package.json，注入给「关于」菜单用。
  // 不在运行时 import package.json：浏览器端没有文件系统，
  // 让 Vite 在构建时内联字符串，两个端（浏览器 / Tauri）都拿得到。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify('https://github.com/renxf0319/kore'),
  },
  server: { port: 5173, strictPort: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
  worker: { format: 'es' },
})
