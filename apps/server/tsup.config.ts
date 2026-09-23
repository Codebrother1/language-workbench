import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'], format: ['esm'], target: 'node22', outDir: 'dist',
  noExternal: ['@workbench/domain'], external: ['node:sqlite', 'openai'],
  // node:sqlite is prefix-only: rewriting it to "sqlite" breaks production startup.
  removeNodeProtocol: false,
  clean: true,
});
