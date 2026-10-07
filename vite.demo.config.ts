import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** 체험판에는 아이콘 파일이 따로 없으므로 index.html 의 아이콘 연결을 뺀다. */
function dropIconLinks(): Plugin {
  return {
    name: 'drop-icon-links',
    transformIndexHtml: (html) => html.replace(/\s*<link rel="(icon|apple-touch-icon)"[^>]*>/g, ''),
  };
}

// 체험판: 서버 없이 파일 하나로 열리는 빌드. `npm run build:demo`
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), viteSingleFile(), dropIconLinks()],
  build: { outDir: 'dist-demo' },
});
