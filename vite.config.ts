import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/** Preload the brush glb (the biggest download) from the HTML so it starts before main.js is parsed. In a build the
    href is the content-hashed /assets/brush-<hash>.glb; in dev it is the source path Vite serves. */
function preloadBrush(): Plugin {
  const SRC = 'src/assets/model/brush.glb';
  return {
    name: 'suri-preload-brush',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        let href = '/' + SRC;
        if (ctx.bundle) {
          const asset = Object.values(ctx.bundle).find(
            (o) => o.type === 'asset' && (o.originalFileNames ?? []).some((n) => n.endsWith(SRC)),
          );
          if (!asset) throw new Error(`${SRC} is not in the bundle`);
          href = '/' + asset.fileName;
        }
        return [{ tag: 'link', attrs: { rel: 'preload', as: 'fetch', href, crossorigin: '' }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig({
  plugins: [preloadBrush()],
  // Never inline: every model, tile and font ships as its own content-hashed file under /assets (cached immutable).
  build: { assetsInlineLimit: 0 },
  server: { port: 3240 },
  preview: { port: 3240 },
});
