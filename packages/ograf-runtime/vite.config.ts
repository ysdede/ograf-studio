import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Produces a single self-contained ESM bundle with the OGraf frame player and no external imports that
// packages/codegen embeds — via a `?raw` import — into every exported package's main.js, and
// that the in-app preview harness also loads, so preview and export can never diverge.
export default defineConfig({
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es'],
      fileName: () => 'graphic-runtime.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rolldownOptions: {
      output: {
        // Every package carries this runtime; unminified it was 1.6 MB of each main.js. Drop
        // whitespace and comments only: names stay, because worker and sandbox kernels are
        // shipped as Function source (fn.toString()) and renamed outer names break them.
        minify: { compress: false, mangle: false, codegen: { removeWhitespace: true } },
      },
    },
  },
});
