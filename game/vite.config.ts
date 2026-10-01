import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    // S3（质检项）：拆分 three.js 引擎与游戏逻辑——首屏可并行加载，游戏迭代时 vendor chunk 命中缓存
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          game: ['src/main.ts'],
        },
      },
    },
  },
});
